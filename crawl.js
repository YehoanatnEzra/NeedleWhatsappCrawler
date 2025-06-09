
const { create } = require('@open-wa/wa-automate');
const fs = require('fs');

// === CONFIG ===
const TARGET_GROUP_NAME = 'מחט בערימת דאטה';
    // = 'ניידל קבוצת האלופים';
const path = require('path');
const EXPORT_DIR = 'exports';


const MAX_MESSAGES = 1000;


// ============================== MAIN ====================================
create().then(async client => {
    try {
        const group = await findGroup(client, TARGET_GROUP_NAME);
        if (!group) return;


        let participants = await client.getGroupMembers(group.id);
        participants = filterParticipants(participants);
        console.log(`👥 Found ${participants.length} participants in group "${group.name}"`);
        const messages = await loadAllMessages(client, group.id, MAX_MESSAGES);
        // exportDebugs(messages,participants);

        // const members = extractUsersFromMessages(messages, participants);
        // console.log(`------members size is ${members.length}------`);


        const enriched = enrichMessages(messages, participants);

        const exportData = {
            messages: enriched,
            participants: participants
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


function getLid(msg) {
    const candidates = [];

    // From author (string or object)
    if (typeof msg.author === 'string') {
        candidates.push(msg.author);
    }

    // From sender object
    if (msg.sender) {
        if (typeof msg.sender === 'string') {
            candidates.push(msg.sender);
        } else {
            if (msg.sender.id) candidates.push(msg.sender.id);
            if (msg.sender.formattedName) candidates.push(msg.sender.formattedName);
            if (msg.sender.pushname) candidates.push(msg.sender.pushname);
            if (msg.sender.name) candidates.push(msg.sender.name);
        }
    }

    // Scan for the first LID
    for (const value of candidates) {
        if (isLid(value)) {
            return value;
        }
    }

    return null;
}


function getPhoneNumber(msg) {
    const candidates = [];

    // From author (string or object)
    if (typeof msg.author === 'string') {
        candidates.push(msg.author);
    }

    // From sender object
    if (msg.sender) {
        if (typeof msg.sender === 'string') {
            candidates.push(msg.sender);
        } else {
            if (msg.sender.id) candidates.push(msg.sender.id);
            if (msg.sender.formattedName) candidates.push(msg.sender.formattedName);
            if (msg.sender.pushname) candidates.push(msg.sender.pushname);
            if (msg.sender.name) candidates.push(msg.sender.name);
        }
    }

    // Scan all candidates for phone numbers
    for (const value of candidates) {
        if (isPhoneNumber(value)) {
            return normalizePhoneNumber(value);
        }
    }
    return null;
}



function exportDebugs(messages, participants){
    p_export = filterParticipants(participants);
    fs.writeFileSync('filtered_debug_participants.json', JSON.stringify(p_export, null, 2));

    phones = 0;
    lids = 0;
    m_export = filterMessages(messages);
    console.log(`📋 Found ${messages.length} messages to process.`);
    messages.forEach((m) => {
        phone = getPhoneNumber(m);
        if (phone) {
            console.log(`📞 Phone found in message: ${phone}, total finds: ${++phones}`);
        }
        else if (getLid(m)) {
            console.log(`📜 LID found in message: ${getLid(m)}, total finds: ${++lids}`);
        }
        else{
            console.log(`❌ No phone found in message: ${m.id}`);
        }
    });
    console.log(`📞 Total phone numbers found: ${phones}`);
    console.log(`📜 Total LIDs found: ${lids}`);

    fs.writeFileSync('filtered_debug_messages.json', JSON.stringify(m_export, null, 2));
}

function filterParticipants(participants){

    const result =  participants.map((p) => ({
            // if formattedName is a phone number, use it as phone instead of formattedName
            id: p.id,
        name: p.name,
        shortName : p.shortName,
        pushname : p.pushname,
        // formattedName : isPhoneNumber(p.formattedName) ? null : p.formattedName,
        phone: isPhoneNumber(p.formattedName) ? normalizePhoneNumber(p.formattedName) : null,
        })
    );

    Object.keys(result).forEach((key) => {
        if (result[key] === null) delete result[key];
    });
    return result;

}
function filterMessages(messages) {
    return messages.map((msg) => {
        const sender = parseParticipant(msg.sender);
        const author = parseParticipant(msg.author, true); // isAuthor = true

        const merged = mergeParticipants(author, sender);

        return {
            msgHeader: msg.id,
            ...merged
        };
    });
}

function parseParticipant(entity, isAuthor = false) {
    if (!entity) return {};

    if (typeof entity === "string") {
        // Likely an author: raw ID
        if (entity.includes('@g.us')) return {};
        return isPhoneNumber(entity)
            ? { phone: normalizePhoneNumber(entity) }
            : isLid(entity)
                ? { id: entity }
                : { unknown: entity };
    }

    // Otherwise, it's a sender object
    const id = entity.id || null;
    const formattedName = entity.formattedName || null;

    const phone =
        isPhoneNumber(id) ? normalizePhoneNumber(id) :
            isPhoneNumber(formattedName) ? normalizePhoneNumber(formattedName) : null;

    const name =
        !isPhoneNumber(formattedName) && formattedName ? formattedName : null;

    const out = {};
    if (isLid(id)) out.id = id;
    if (phone) out.phone = phone;
    if (name) out.name = name;

    return out;
}

function mergeParticipants(a = {}, b = {}) {
    const result = {};

    // Merge 'id'
    if (a.id && b.id && a.id !== b.id) {
        result.id = a.id;
        result.altId = b.id;
    } else {
        result.id = a.id || b.id;
    }

    // Merge 'phone'
    if (a.phone && b.phone && a.phone !== b.phone) {
        result.phone = a.phone;
        result.altPhone = b.phone;
    } else {
        result.phone = a.phone || b.phone;
    }

    // Merge 'name'
    if (a.name && b.name && a.name !== b.name) {
        result.name = a.name;
        result.altName = b.name;
    } else {
        result.name = a.name || b.name;
    }

    // Any leftovers
    if (a.unknown && !result.name) result.name = a.unknown;
    if (b.unknown && !result.name) result.name = b.unknown;

    return result;
}

// function filterMessages(messages){
//
//     const senderInfo = (sender) => {
//         if (!sender) return null;
//
//         const phone = isPhoneNumber(sender?.id) ? normalizePhoneNumber(sender?.id) : null;
//         let formattedName = isPhoneNumber(sender?.formattedName) ? normalizePhoneNumber(sender?.formattedName) : sender?.formattedName;
//
//         if (phone) {return phone === formattedName ? { phone } : { phone, formattedName };}
//
//
//         return { id: sender?.id, formattedName };
//     };
//
//     const authorInfo = (author) => {
//         if (!author || author.includes('@g.us')) return null;
//
//         if (isPhoneNumber(author)) {
//             return {phone: normalizePhoneNumber(author)};
//         }
//         if (isLid(author)) {
//             return {id: author};
//         }
//         return {author: author}
//     }
//
//     return messages.map((msg) => ({
//         msgHeader: msg.id,
//         // author : msg.author,
//         // sender : senderInfo(msg.sender)
//         author : authorInfo(msg.author),
//         sender: senderInfo(msg.sender)
//     }));
// }

function isLid(input) {
    if (!input || typeof input !== 'string') {
        return false; // Return false if input is null or not a string
    }

    return input.includes('@lid');
}

function isPhoneNumber(input) {
    if (!input || typeof input !== 'string') {
        return false; // Return false if input is null or not a string
    }

    // Regular expression to match phone numbers in the handled formats
    const phoneRegex = /(\+?972[-\s]?\d{2}[-\s]?\d{3}[-\s]?\d{4})|(972\d{9})/;

    return phoneRegex.test(input);
}

function normalizePhoneNumber(input) {
    if (!input || typeof input !== 'string') {
        return input; // Return as is if input is null or not a string
    }

    // Check if the string contains '972'
    if (input.includes('972')) {
        // Extract only numeric characters, preserving the leading '972'
        const normalized = input.replace(/[^\d]/g, '');
        return normalized.startsWith('972') ? normalized : input;
    }

    // Return the string as is if '972' is not found
    return input;
}


function extractUsersFromMessages(messages, participants) {
    const removeDirectionalMarks = (str) =>
        str?.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '') || '';

    const normalizePhone = (str) => {
        const cleaned = removeDirectionalMarks(str || '').replace(/[-\s]/g, '');
        const match = cleaned.match(/\+972\d{8,9}/);
        return match ? match[0].replace(/\D/g, '') : null;
    };

    const isPhoneLike = (str) =>
        /\+972\s?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/.test(removeDirectionalMarks(str || ''));

    const identityMap = new Map();
    function register({ id, phone, nameSource }) {
        const baseId = id?.split('@')[0];
        const key = phone || baseId || nameSource;

        if (!key) return;

        if (!identityMap.has(key)) {
            identityMap.set(key, {
                lid: id?.includes('@lid') ? baseId : null,
                phone: phone || (id?.includes('@c.us') ? baseId : null),
                pushname: nameSource
            });
        } else {
            const existing = identityMap.get(key);
            if (!existing.lid && id?.includes('@lid')) existing.lid = baseId;
            if (!existing.phone && id?.includes('@c.us')) existing.phone = baseId;
            if (!existing.pushname && nameSource) existing.pushname = nameSource;
        }
    }

    const handleContact = (contact) => {
        if (!contact?.id) return;
        const id = contact.id;
        const phone = normalizePhone(contact.formattedName) || normalizePhone(contact.pushname);
        const pushname = removeDirectionalMarks(contact.pushname || contact.name || contact.formattedName || '');

        if (isPhoneLike(pushname) && !phone) {
            register({ id, phone: normalizePhone(pushname), nameSource: pushname });
        } else {
            register({ id, phone, nameSource: pushname });
        }
    };

    messages.forEach(msg => {
        if (msg.sender) handleContact(msg.sender);
        if (msg.quotedMsg?.sender) handleContact(msg.quotedMsg.sender);
    });

    participants.forEach(handleContact);

    // Merge entries with same pushname but different lid/phone
    const mergedMap = new Map();

    identityMap.forEach((entry, key) => {
        const nameKey = removeDirectionalMarks(entry.pushname || '').trim();

        if (!mergedMap.has(nameKey)) {
            mergedMap.set(nameKey, entry);
        } else {
            const existing = mergedMap.get(nameKey);
            if (!existing.lid && entry.lid) existing.lid = entry.lid;
            if (!existing.phone && entry.phone) existing.phone = entry.phone;
        }
    });

    return Array.from(mergedMap.values());

    // return Array.from(identityMap.values());
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
    // print the top 10 groups:

    console.log(`🔍 Searching for group "${name}"...`);
    if (!groups || groups.length === 0) {
        console.log('❌ No groups found.');
        return null;
    }
    console.log(`📋 Found ${groups.length} groups:`);
    groups.slice(0, 10).forEach((g, i) => {
        const groupName = hebrewifyIfNeeded(g.name || 'Unknown Group');
        console.log(`   ${i + 1}). ${groupName} (${g.id})`);
    });
    console.log('-----------------------------');



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
    // const senderInfo = getInfo(getReadableSenderId(msg), members) || {lid: "Unknown Lid",phone: "Unknown Phone", pushname: "Unknown Name"};
    const senderInfo = (msg, members) => {
        const phone = getPhoneNumber(msg);
        if (phone){
            // finding the participant by phone number
            return  members.find(p => p.phone === phone);
        }
        const lid = getLid(msg);
        if (lid) {
            // finding the participant by lid
            return members.find(p => p.id === lid);
        }
        return "Unknown Member";
    }
    const sender = senderInfo(msg, members);
    console.log(`Enriching message ${index + 1} sent by ${JSON.stringify(sender)} `);

    return {
        id: parsedId.valid ? parsedId.msgHashId : msg.id,
        sender : senderInfo(msg, members),
        timestamp: msg.timestamp,
        body: extractMessageBody(msg),
        replyTo,
        reactions: formatReactionsForMessage(msg)
    };
}

function buildReplyTo(msg, members) {
    // If the message is not a reply, return null
    if (!msg.quotedMsg || !msg.quotedParticipant) return null;

    const fetchReplierInfo = (quotedParticipant, members) => {
        if (!quotedParticipant) return "Unknown Member";
        if (isPhoneNumber(quotedParticipant)) {
            return members.find(p => p.phone === normalizePhoneNumber(quotedParticipant)) || quotedParticipant;
        }
        if (isLid(quotedParticipant)) {
            return members.find(p => p.id === quotedParticipant) || quotedParticipant;
        }
        return quotedParticipant; // Fallback to raw ID if no match found

    }


    // If the message is a reply, extract the quoted message info
    const author = fetchReplierInfo(msg.quotedParticipant, members);

    // const authorName = authorInfo ? hebrewifyIfNeeded(authorInfo.name) : "Unknown" +
    //     " Member";
    // const authorId = authorInfo ? authorInfo.lid || authorInfo.phone : "Unknown";
    const quotedText = extractMessageBody(msg.quotedMsg);
    const refId = msg.quotedStanzaID || "unresolved referance to replied msg";
    return {
        ref : refId,
        author: author,
        body: quotedText
    };
}

function extractMessageBody(msg) {
    return msg.isMedia
        ? "<Media Message (Truncated)>"
        : msg.body || msg.content || "[No text]";
}

// function getNameFromMap(nameMap, rawId) {
//     const id = stripLid(rawId);
//     return nameMap.get(id) || id;
// }

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
        sender : msg.sender,
        // SenderId: msg.SenderId,
        // SenderName: msg.SenderName,
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