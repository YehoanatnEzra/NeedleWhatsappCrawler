// participantsEnricher.js

// This module handles inferred participant data (from chat message history)

const { isPhoneNumber, isLid, normalizePhoneNumber } = require('./common');

/**
 * Attempts to extract participants from chat messages
 * by inspecting sender metadata and push names.
 */
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
        const pushname = removeDirectionalMarks(
            contact.pushname || contact.name || contact.formattedName || ''
        );

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

    // Merge entries by pushname
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
}

/**
 * Helper for locating a user record by any known identifier
 */
function getInfo(key, users) {
    if (!key || !Array.isArray(users)) {
        console.warn(`Invalid key or users array: ${key}, ${users}`);
        return null;
    }

    const normalizedKey = key.replace(/[^0-9]/g, '');

    return (
        users.find(user =>
            user.lid === key ||
            user.phone === key ||
            user.phone === normalizedKey
        ) || null
    );
}

module.exports = {
    extractUsersFromMessages,
    getInfo
};