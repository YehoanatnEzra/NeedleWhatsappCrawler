
const { create } = require('@open-wa/wa-automate');
const fs = require('fs');

// === CONFIG ===
const TARGET_GROUP_NAME = 'ניידל קבוצת האלופים';
const path = require('path');
const EXPORT_DIR = 'exports';


const MAX_MESSAGES = 1000;


// ============================== MAIN ====================================
create().then(async client => {
    try {
        const group = await findGroup(client, TARGET_GROUP_NAME);
        if (!group) return;

        const messages = await loadAllMessages(client, group.id, MAX_MESSAGES);

        // fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2));
        // console.log(`✅ Dumped ${messages.length} raw messages to messages.json`);

        const members = extractUsersFromMessages(messages);

        // const nameMap = createMemberNameMap(participants);


        const enriched = enrichMessages(messages, members);

        const exportData = {
            messages: enriched,
            nameMap: members
        };

        const filename = sanitizeFilename(group.name) + '.json';
        const outputPath = path.join(EXPORT_DIR, filename);
        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
        console.log(`✅ Exported ${enriched.length} messages to ${outputPath}`);

        process.exit();
    } catch (error) {
        console.error('❌ Error during processing:', error);
    }
});






// ============================== HELPERS ====================================


function sanitizeFilename(name) {
    return name.replace(/[\/\\?%*:|"<>]/g, '-');
}

function buildParticipantInfo(participants, messages) {
    const infoMap = new Map();

    // Add current group participants
    for (const p of participants) {
        const id = p.id.replace(/@.*/, '');
        const name = hebrewifyIfNeeded(p.pushname || p.name || 'Unknown');
        const phone = id.startsWith('972') ? '0' + id.slice(3) : id;

        infoMap.set(id, { phone, name });
    }

    // Add senders from message history
    for (const msg of messages) {
        const senderRawId = parseMessageId(msg.id)?.senderId;
        if (!senderRawId) continue;

        const id = senderRawId.replace(/@.*/, '');
        if (infoMap.has(id)) continue;

        const name = hebrewifyIfNeeded(
            msg.sender?.pushname || msg.sender?.formattedName || 'Unknown'
        );
        const phone = id.startsWith('972') ? '0' + id.slice(3) : id;

        infoMap.set(id, { phone, name });
    }


    return infoMap;
}

function getReadableSenderId(msg) {
    // 1. Try structured sender object first
    const rawId =
        msg.sender?.id ||
        (msg.id && parseMessageId(msg.id).senderId) ||
        msg.author ||
        'unknown@unknown';

    // 2. Try to extract a phone number
    // const phoneMatch = rawId.match(/^(\d{8,15})@c\.us$/);
    return rawId.replace(/@.*/, ''); // Strip domain

}
function parseMessageId(messageId) {
    if (typeof messageId !== 'string') {
        return { valid: false, reason: 'Message ID is not a string', raw: messageId };
    }

    const parts = messageId.split('_');

    if (parts.length !== 4) {
        return { valid: false, reason: 'Invalid message ID format', raw: messageId };
    }

    let [fromMeRaw, chatId, msgHashId, senderId] = parts;
    senderId = senderId.replace(/@.*/, ''); // Strip domain from sender ID

    return {
        valid: true,
        chatId,
        msgHashId,
        senderId

    };
}


// function createMemberNameMap(participants) {
//     const nameMap = new Map();
//     participants.forEach(p => {
//         const pushName = p.pushname || p.name || "Unknown Member";
//         // const phoneNumber =
//         const cleanId = p.id.replace(/@.*/, '');
//         nameMap.set(cleanId, hebrewifyIfNeeded(pushName));
//     });
//     return nameMap;
// }


function extractUsersFromMessages(messages) {
    const normalizePhone = (str) => {
        if (!str) return null;
        const match = str.match(/\+972\s?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/);
        return match ? match[0].replace(/\D/g, '') : null;
    };

    const nameKey = ({ name = '', shortName = '', pushname = '' }) =>
        `${name.trim()}|${shortName.trim()}|${pushname.trim()}`;

    const userMap = new Map();

    const handleSender = (sender) => {
        if (!sender || typeof sender !== 'object' || !sender.id) return;

        const [rawId, domain] = sender.id.split('@');
        const lid = domain === 'lid' ? rawId : null;
        const phone = domain === 'c.us' && rawId.startsWith('972') ? rawId : normalizePhone(sender.formattedName);
        const pushname = sender.pushname || sender.formattedName || sender.name || '';

        const key = nameKey(sender);
        if (!userMap.has(key)) {
            userMap.set(key, { lid, phone, pushname });
        } else {
            const entry = userMap.get(key);
            if (!entry.lid) entry.lid = lid;
            if (!entry.phone) entry.phone = phone;
        }
    };

    messages.forEach(msg => {
        handleSender(msg.sender);
        if (msg.quotedMsg && msg.quotedMsg.sender) {
            handleSender(msg.quotedMsg.sender);
        }
    });

    return Array.from(userMap.values());
}

function getInfo(key, users) {
    if (!key || !users || !Array.isArray(users)){
        console.log('Invalid key or users array: ${key}, ${users}');
        return null;
    }

    const normalizedKey = key.replace(/[^0-9]/g, ''); // strip non-digits if it's a phone number

    const result =  users.find(user =>
        user.lid === key || user.phone === key || user.phone === normalizedKey
    ) || null;

    if (!result) {
        console.warn(`No info found for key: ${key}, users: ${JSON.stringify(users)}`);
        return null;
    }
    return result;
}





// function printParticipants(participants) {
//     console.log('-----------------------------');
//     console.log(`👥 Participants (${participants.length}):`);
//     let i = 1;
//
//     participants.forEach(p => {
//         let pushName = p.pushname || p.name || "Unknown Member";
//         pushName = hebrewifyIfNeeded(pushName);
//
//
//         // Reverse string if it's Hebrew
//
//         const cleanId = p.id.replace(/@.*/, '');
//         // const phoneNumber =
//         console.log(`   ${i++}). ${pushName} (${JSON.stringify(p)})`);
//     });
//
//     console.log('-----------------------------');
// }

function hebrewifyIfNeeded(text) {
    // If the text contains Hebrew characters, reverse it
    const hasHebrew = /[\u0590-\u05FF]/.test(text);
    if (hasHebrew) {
        return text.split('').reverse().join('');
    }
    return text;

}

async function findGroup(client, name) {
    const groups = await client.getAllGroups();
    const group = groups.find(g => g.name?.includes(name));
    if (!group) {
        console.log(`❌ Group "${name}" not found.`);
        return null;
    }
    console.log(`✅ Found group: ${hebrewifyIfNeeded(group.name)} (${group.id})`);
    return group;
}

async function loadAllMessages(client, chatId, maxCount) {
    let allMessages = [];
    const seenIds = new Set();

    while (allMessages.length < maxCount) {
        console.log(`📥 Loading... (unique messages: ${allMessages.length})`);
        const newMessages = await client.loadEarlierMessages(chatId);
        if (!newMessages || newMessages.length === 0) break;

        let added = 0;
        for (const msg of newMessages) {
            if (!seenIds.has(msg.id)) {
                seenIds.add(msg.id);
                allMessages.push(msg);
                added++;
            }
        }

        if (added === 0) {
            console.log('🛑 No new messages, stopping.');
            break;
        }

        await new Promise(r => setTimeout(r, 300)); // throttle
    }

    return allMessages;
}

function formatReactionsForMessage(msg) {
    if (!msg.reactions || msg.reactions.length === 0) return null;

    // Creating a map of (reaction emoji, count, reactedBy array of
    // participant IDs) using ReactionSender.senderUserJid field

    return msg.reactions.map(reaction => {



        return {
            emoji: reaction.aggregateEmoji,
            count: reaction.senders.length,
            reactedBy: reaction.senders.map(sender => sender.senderUserJid.replace(/@.*/, '')) // Stripping domain from participant IDs
            // up IDs
        };
    });
}


function enrichMessages(messages, members) {
    messages.sort(sortByTimestamp);

    const enriched = messages.map((msg, index) => enrichSingleMessage(msg, index, members));

    return enriched
        .filter(isValidMessage)
        .sort(sortByTimestamp)
        .map(addFinalMetadata);
}


function sortByTimestamp(a, b) {
    return a.timestamp - b.timestamp;
}

function enrichSingleMessage(msg, index, members) {
    const replyTo = buildReplyTo(msg, members);

    const parsedId = parseMessageId(msg.id);
    const senderInfo = getInfo(getReadableSenderId(msg), members) || {lid: "Unknown Lid",phone: "Unknown Phone", pushname: "Unknown Name"};




    return {
        id: parsedId.valid ? parsedId.msgHashId : msg.id,
        SenderId: senderInfo.lid,
        SenderName: senderInfo.pushname,
        timestamp: msg.timestamp,
        body: extractMessageBody(msg),
        replyTo,
        reactions: formatReactionsForMessage(msg)
    };
}

function buildReplyTo(msg, members) {
    if (!msg.quotedMsg || !msg.quotedParticipant) return null;
    const authorInfo = getInfo(stripLid(msg.quotedParticipant), members);
    const authorName = authorInfo ? hebrewifyIfNeeded(authorInfo.name) : "Unknown" +
        " Member";
    const authorId = authorInfo ? authorInfo.lid || authorInfo.phone : "Unknown";
    const quotedText = msg.quotedMsg.body || msg.quotedMsg.content || "[No text]";
    const refId = msg.quotedStanzaID || "Unknown Message ID";
    return {
        ref : refId,
        authorId: authorId,
        authorName: authorName,
        body: quotedText};
}

function extractMessageBody(msg) {
    return msg.isMedia
        ? "<Media Message (Truncated)>"
        : msg.body || msg.content || "[No text]";
}

function getNameFromMap(nameMap, rawId) {
    const id = stripLid(rawId);
    return nameMap.get(id) || id;
}

function stripLid(id) {
    return id.replace(/@.*/, '');
}

function isValidMessage(msg) {
    return typeof msg.timestamp === 'number' && msg.timestamp > 0;
}

function addFinalMetadata(msg, index) {
    return {
        serialNumber: index + 1,
        datetime: formatTimestamp(msg.timestamp),
        messageId: msg.id,
        SenderId: msg.SenderId,
        SenderName: msg.SenderName,
        body: msg.body,
        replyTo: msg.replyTo,
        reactions: msg.reactions
    };
}

function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}






/**
 * NOTES AND TODOs:
 *
 * ---Creating threads---
    * We can use this to traverse the quote chain (thread):
 * ----quoteMap: QuoteMap; --  line 207
 * from library file: node_modules/@open-wa/wa-automate/dist/api/model/message.d.ts




 */