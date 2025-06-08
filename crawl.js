
const { create } = require('@open-wa/wa-automate');
const fs = require('fs');

// === CONFIG ===
const TARGET_GROUP_NAME = 'ניידל קבוצת האלופים';
const MAX_MESSAGES = 1000;
const OUTPUT_FILE = 'group_export.json';


// ============================== MAIN ====================================
create().then(async client => {
    try {
        const group = await findGroup(client, TARGET_GROUP_NAME);
        if (!group) return;

        const messages = await loadAllMessages(client, group.id, MAX_MESSAGES);
        fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2));
        console.log(`✅ Dumped ${messages.length} raw messages to messages.json`);
        const participants = await client.getGroupMembers(group.id);
        // creating a dictionary of (id, name) for participants
        const nameMap = createMemberNameMap(participants);
        // const participantsInfo = buildParticipantInfo(participants, messages);
        //
        // participantsInfo.forEach((info, id) => {
        //     console.log(`👤 Participant ID: ${id}, Name: ${info.name}, Phone: ${info.phone}`);
        // });



        const enriched = enrichMessages(messages, nameMap);

        const exportData = {
            messages: enriched,
            nameMap: Object.fromEntries(nameMap) // converts Map to plain object
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exportData, null, 2));
        console.log(`✅ Exported ${enriched.length} messages to ${OUTPUT_FILE}`);


        process.exit();
    } catch (error) {
        console.error('❌ Error during processing:', error);
    }
});






// ============================== HELPERS ====================================

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
    const cleanId = rawId.replace(/@.*/, ''); // Strip domain

    // if the number starts with 972, replace it with 0
    if (cleanId.startsWith('972')) {
        return '0' + cleanId.slice(3); // Replace 972 with 0
    }
    // 3. If no phone number, return the raw ID
    return cleanId;
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


function createMemberNameMap(participants) {
    const nameMap = new Map();
    participants.forEach(p => {
        const pushName = p.pushname || p.name || "Unknown Member";
        // const phoneNumber =
        const cleanId = p.id.replace(/@.*/, '');
        nameMap.set(cleanId, hebrewifyIfNeeded(pushName));
    });
    return nameMap;
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

function enrichMessages(messages, nameMap) {
    // sorting messages by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);

    messages.forEach((msg, index) => {
        if (msg.quotedMsg) {
            const quotedParticpantid = msg.quotedParticipant.replace(/@.*/, '');
            const name = nameMap.get(quotedParticpantid) || msg.quotedParticipant.replace(/@.*/, '');
            console.log(`🔗 Message ${index + 1} is a reply to: ${name} with text: "${msg.quotedMsg.body || msg.quotedMsg.content || '[No text]'}"`);
        }
    });



    const enriched = messages.map((msg, index, arr) => {
        // if (index > 200) {
        //     console.log(JSON.stringify(msg, null, 2));
        //     console.log("---------------------------------\n------------------------------");
        // }

        const text =(msg.isMedia)? "<Media Message (Truncated)>" : msg.body || msg.content || '[No text]';
        // const text = msg.body?.trim() || msg.caption?.trim() || '[Media message]';

        let replyTo = null;
        if (msg.quotedMsg) {
            const quotedParticpantid = msg.quotedParticipant.replace(/@.*/, '');
            const name = nameMap.get(quotedParticpantid) || msg.quotedParticipant.replace(/@.*/, '');
            replyTo = (!msg.quotedMsg)? null : `🔗 ${name} with text: "${msg.quotedMsg.body || msg.quotedMsg.content || '[No text]'}"`
        }


        let parsedId = parseMessageId(msg.id);

        if (!parsedId.valid) {
            console.log(`❌ Invalid message ID: ${msg.id} - Reason: ${parsedId.reason}`)
        } else {
            console.log(`✅ Message ID: ${parsedId.msgHashId} - Parsed as: ${JSON.stringify(parsedId)}`);
        }



        return {
            id: (parsedId.valid) ? parsedId.msgHashId : msg.id,
            SenderName:  hebrewifyIfNeeded((parsedId.valid) ? nameMap.get(parsedId.senderId) : msg.from),
            SenderId: getReadableSenderId(msg),
            timestamp: msg.timestamp,
            body: text,
            replyTo,
            reactions: formatReactionsForMessage(msg)
        };
    });


    // Filter invalid
    const valid = enriched.filter(msg =>
        typeof msg.timestamp === 'number' &&
        !isNaN(msg.timestamp) &&
        msg.timestamp > 0
    );

    valid.sort((a, b) => a.timestamp - b.timestamp);

    valid.forEach((msg, index) => {
        msg.msgNumber = index + 1;
        msg.datetime = new Date(msg.timestamp * 1000).toISOString();
        delete msg.timestamp;
    });


    return valid.map(msg => {
        return {
            serialNumber: msg.msgNumber,
            datetime: msg.datetime,
            messageId: msg.id,
            SenderId: msg.SenderId,
            SenderName: msg.SenderName,
            body: msg.body,
            replyTo: msg.replyTo,
            reactions: msg.reactions
        };
    });
}


/**
 * NOTES AND TODOs:
 *
 * ---Creating threads---
    * We can use this to traverse the quote chain (thread):
 * ----quoteMap: QuoteMap; --  line 207
 * from library file: node_modules/@open-wa/wa-automate/dist/api/model/message.d.ts




 */