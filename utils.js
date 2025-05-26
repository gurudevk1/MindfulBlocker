// utils.js

/**
 * Generates a unique ID.
 * For simplicity, using timestamp. For more robustness, consider UUID.
 * @returns {string} A unique ID string.
 */
function generateUniqueId() {
    return Date.now().toString();
}

/**
 * Formats a timestamp into a human-readable time string (HH:MM AM/PM).
 * @param {number} timestamp - The timestamp in milliseconds.
 * @returns {string} Formatted time string.
 */
function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats a timestamp into a human-readable date and time string.
 * @param {number} timestamp - The timestamp in milliseconds.
 * @returns {string} Formatted date and time string.
 */
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}


/**
 * Calculates remaining time until a future timestamp.
 * @param {number} unblockTimestamp - The future timestamp in milliseconds.
 * @returns {string} Human-readable remaining time or "Expired".
 */
function getRemainingTime(unblockTimestamp) {
    if (!unblockTimestamp) return "";
    const now = Date.now();
    const diff = unblockTimestamp - now;

    if (diff <= 0) return "Soon"; // Or "Expired" if it should have been unblocked by an alarm

    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    let remaining = "";
    if (days > 0) remaining += `${days}d `;
    if (hours > 0) remaining += `${hours}h `;
    if (minutes > 0) remaining += `${minutes}m `;
    
    return remaining.trim() || "<1m";
}

/**
 * Shows a toast message.
 * @param {string} message - The message to display.
 * @param {string} type - 'success' (default) or 'error'.
 */
function showToast(message, type = 'success') {
    const toastElement = document.getElementById('toast-message');
    if (!toastElement) return;

    toastElement.textContent = message;
    toastElement.classList.remove('hidden', 'bg-sky-500', 'bg-red-500');

    if (type === 'error') {
        toastElement.classList.add('bg-red-500');
    } else {
        toastElement.classList.add('bg-sky-500');
    }
    
    toastElement.classList.remove('opacity-0');
    toastElement.classList.add('opacity-100');

    setTimeout(() => {
        toastElement.classList.remove('opacity-100');
        toastElement.classList.add('opacity-0');
        setTimeout(() => toastElement.classList.add('hidden'), 300);
    }, 3000);
}

/**
 * Normalizes a URL to a hostname or a more consistent format for blocking.
 * Removes 'http://', 'https://', 'www.' and paths.
 * @param {string} urlString - The URL to normalize.
 * @returns {string|null} Normalized hostname or null if invalid.
 */
function normalizeUrl(urlString) {
    try {
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = 'http://' + urlString;
        }
        const url = new URL(urlString);
        let hostname = url.hostname;
        // Remove 'www.' if present
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        console.error("Invalid URL for normalization:", urlString, e);
        return null; // Or return the original string if preferred, but null helps identify issues
    }
}
