// enrichment.js
//This module handles all logic related to turning raw messages into
// enriched structured data, including replies, reactions, and sender metadata.
const {
    parseMessageId,
    getPhoneNumber,
    getLid
} = require('./messageUtils');

const { isPhoneNumber, isLid, normalizePhoneNumber } = require('./common');

function enrichMessages(messages, members) {
    messages.sort(sortByTimestamp);

    const enriched = messages.map((msg, index) =>
        enrichSingleMessage(msg, index, members)
    );

    return enriched
        .filter(isValidMessage)
        .sort(sortByTimestamp)
        .map(addFinalMetadata);
}

function enrichSingleMessage(msg, index, members) {
    const parsedId = parseMessageId(msg.id);
    const sender = resolveSender(msg, members);
    const replyTo = buildReplyTo(msg, members);

    console.log(`Enriching message ${index + 1} sent by ${JSON.stringify(sender)}`);

    return {
        id: parsedId.valid ? parsedId.msgHashId : msg.id,
        sender,
        timestamp: msg.timestamp,
        body: extractMessageBody(msg),
        replyTo,
        reactions: formatReactionsForMessage(msg)
    };
}

function resolveSender(msg, members) {
    const phone = getPhoneNumber(msg);
    if (phone) {
        return members.find(p => p.phone === phone) || "Unknown Member";
    }

    const lid = getLid(msg);
    if (lid) {
        return members.find(p => p.id === lid) || "Unknown Member";
    }

    return "Unknown Member";
}

function buildReplyTo(msg, members) {
    if (!msg.quotedMsg || !msg.quotedParticipant) return null;

    const quoted = msg.quotedParticipant;

    const author = isPhoneNumber(quoted)
        ? members.find(p => p.phone === normalizePhoneNumber(quoted)) || quoted
        : isLid(quoted)
            ? members.find(p => p.id === quoted) || quoted
            : quoted;

    return {
        ref: msg.quotedStanzaID || "unresolved reference",
        author,
        body: extractMessageBody(msg.quotedMsg)
    };
}

function extractMessageBody(msg) {
    return msg.isMedia ? "<Media Message (Truncated)>" : msg.body || msg.content || "[No text]";
}

function formatReactionsForMessage(msg) {
    if (!msg.reactions?.length) return null;

    return msg.reactions.map(reaction => ({
        emoji: reaction.aggregateEmoji,
        count: reaction.senders.length,
        reactedBy: reaction.senders.map(s => s.senderUserJid.replace(/@.*/, ''))
    }));
}

function isValidMessage(msg) {
    return typeof msg.timestamp === 'number' && msg.timestamp > 0;
}

function addFinalMetadata(msg, index) {
    return {
        serialNumber: index + 1,
        datetime: formatTimestamp(msg.timestamp),
        messageId: msg.id,
        sender: msg.sender,
        body: msg.body,
        replyTo: msg.replyTo,
        reactions: msg.reactions
    };
}

function sortByTimestamp(a, b) {
    return a.timestamp - b.timestamp;
}

function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}

module.exports = {
    enrichMessages
};