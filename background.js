// background.js

const BLOCKED_PAGE_URL = chrome.runtime.getURL('blocked.html');
const RULE_ID_PREFIX = 'mindfulBlockerRule_'; // To ensure our rule IDs are somewhat unique

// Utility to get all active Mindful Blocker rules
async function getExistingRuleIds() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map(rule => rule.id);
}

// Update declarativeNetRequest rules based on the current list of blocked sites
async function updateDeclarativeNetRequestRules(blockedSites = []) {
    try {
        const existingRuleIds = await getExistingRuleIds();
        const ruleIdsToRemove = existingRuleIds.filter(id => typeof id === 'number'); // Only manage numeric IDs we set

        const rulesToAdd = [];
        blockedSites.forEach(site => {
            if (site.isActive !== false && site.url && site.ruleId) { // site.isActive can be undefined (true by default) or true
                const normalizedUrl = site.url; // Assuming URL is already normalized (hostname)
                rulesToAdd.push({
                    id: site.ruleId, // Ensure this is a unique integer >= 1
                    priority: 1,
                    action: {
                        type: 'redirect',
                        redirect: { url: `${BLOCKED_PAGE_URL}?url=${encodeURIComponent(normalizedUrl)}&unblockTime=${site.unblockTime || ''}&blockType=${site.blockType || 'permanent'}` }
                    },
                    condition: {
                        urlFilter: `*://${normalizedUrl}/*`, // Covers http, https, www and non-www
                        resourceTypes: ['main_frame']
                    }
                });
                 rulesToAdd.push({ // Also block www. version explicitly if not already covered
                    id: site.ruleId + 100000, // Offset to avoid collision, ensure this is also unique
                    priority: 1,
                    action: {
                        type: 'redirect',
                        redirect: { url: `${BLOCKED_PAGE_URL}?url=${encodeURIComponent('www.'+normalizedUrl)}&unblockTime=${site.unblockTime || ''}&blockType=${site.blockType || 'permanent'}` }
                    },
                    condition: {
                        urlFilter: `*://www.${normalizedUrl}/*`,
                        resourceTypes: ['main_frame']
                    }
                });
            }
        });
        
        // Filter out rules that are already effectively present to minimize updates
        const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
        const currentRuleMap = new Map(currentRules.map(r => [r.id, r]));

        const finalRulesToAdd = [];
        const finalRuleIdsToRemove = [...ruleIdsToRemove]; // Start with all existing rules

        for (const newRule of rulesToAdd) {
            const existingRule = currentRuleMap.get(newRule.id);
            if (!existingRule || JSON.stringify(existingRule.action) !== JSON.stringify(newRule.action) || JSON.stringify(existingRule.condition) !== JSON.stringify(newRule.condition)) {
                finalRulesToAdd.push(newRule);
            }
            // If a rule is in rulesToAdd, it shouldn't be in finalRuleIdsToRemove
            const indexToRemove = finalRuleIdsToRemove.indexOf(newRule.id);
            if (indexToRemove > -1) {
                finalRuleIdsToRemove.splice(indexToRemove, 1);
            }
        }
        
        if (finalRuleIdsToRemove.length > 0 || finalRulesToAdd.length > 0) {
             console.log('Updating rules. To remove:', finalRuleIdsToRemove, 'To add:', finalRulesToAdd);
             await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: finalRuleIdsToRemove,
                addRules: finalRulesToAdd
            });
            console.log("DeclarativeNetRequest rules updated successfully.");
        } else {
            console.log("No changes to DeclarativeNetRequest rules needed.");
        }

    } catch (error) {
        console.error("Error updating DeclarativeNetRequest rules:", error);
        if (chrome.runtime.lastError) {
            console.error("Last error:", chrome.runtime.lastError.message);
        }
    }
}


// Set up alarms for timed unblocking
async function setupAlarms(blockedSites = []) {
    await chrome.alarms.clearAll(); // Clear existing alarms to avoid duplicates
    console.log("Cleared all existing alarms.");

    blockedSites.forEach(site => {
        if (site.isActive !== false && site.unblockTime && site.unblockTime > Date.now()) {
            const alarmName = `unblock_${site.id}`;
            try {
                chrome.alarms.create(alarmName, { when: site.unblockTime });
                console.log(`Alarm set for site ${site.id} (${site.url}) at ${new Date(site.unblockTime).toLocaleString()}`);
            } catch (e) {
                console.error(`Error creating alarm ${alarmName}:`, e);
            }
        }
    });
    const allAlarms = await chrome.alarms.getAll();
    console.log("Current alarms:", allAlarms);
}

// Listener for alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("Alarm fired:", alarm.name);
    if (alarm.name.startsWith('unblock_')) {
        const siteId = alarm.name.substring('unblock_'.length);
        try {
            const data = await chrome.storage.sync.get(['blockedSites', 'nextRuleId']);
            let currentBlockedSites = data.blockedSites || [];
            let nextRuleIdVal = data.nextRuleId || 1;

            const siteIndex = currentBlockedSites.findIndex(s => s.id === siteId);

            if (siteIndex !== -1) {
                const siteToUnblock = currentBlockedSites[siteIndex];
                console.log(`Attempting to unblock site ID: ${siteId}, URL: ${siteToUnblock.url}`);
                
                // Option 1: Remove the site from the list entirely
                // currentBlockedSites.splice(siteIndex, 1);

                // Option 2: Mark as inactive (if you want to keep it in the list but not blocked)
                currentBlockedSites[siteIndex].isActive = false; 
                // Or, more simply, just remove it, as the UI implies deletion for unblocking.
                // For this implementation, let's remove it to match the typical expectation of "unblocking".
                const ruleIdToRemove = siteToUnblock.ruleId;
                currentBlockedSites.splice(siteIndex, 1);


                await chrome.storage.sync.set({ blockedSites: currentBlockedSites, nextRuleId: nextRuleIdVal });
                console.log(`Site ${siteToUnblock.url} (ID: ${siteId}) marked for unblocking. New list:`, currentBlockedSites);

                // Update declarativeNetRequest rules (this will remove the rule for the unblocked site)
                await updateDeclarativeNetRequestRules(currentBlockedSites);
                // Re-setup alarms for any remaining sites (though this one just fired)
                await setupAlarms(currentBlockedSites); 
                
                console.log(`Site ${siteToUnblock.url} should now be unblocked.`);
                 // Optionally send a notification
                chrome.notifications.create(`unblocked_${siteId}`, {
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Site Unblocked',
                    message: `${siteToUnblock.url} is now accessible.`
                });

            } else {
                console.log(`Site ID ${siteId} not found in storage for unblocking.`);
            }
        } catch (error) {
            console.error("Error processing alarm for site ID:", siteId, error);
        }
    }
});

// Listener for messages from popup (or other extension parts)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateRulesAndAlarms") {
        console.log("Background script received 'updateRulesAndAlarms' message with sites:", request.blockedSites);
        (async () => {
            await updateDeclarativeNetRequestRules(request.blockedSites);
            await setupAlarms(request.blockedSites);
            sendResponse({ status: "success", message: "Rules and alarms updated." });
        })();
        return true; // Indicates that the response is sent asynchronously
    }
    return false;
});

// Initial setup when the extension is installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("Extension installed or updated. Reason:", details.reason);
    try {
        const data = await chrome.storage.sync.get(['blockedSites', 'nextRuleId']);
        const sites = data.blockedSites || [];
        // Ensure nextRuleId is initialized if not present
        if (!data.nextRuleId) {
            let maxId = 0;
            sites.forEach(site => {
                if (site.ruleId && site.ruleId > maxId) maxId = site.ruleId;
            });
            await chrome.storage.sync.set({ nextRuleId: maxId + 1 });
            console.log("Initialized nextRuleId in storage.");
        }
        
        console.log("Initial load/refresh of rules and alarms.");
        await updateDeclarativeNetRequestRules(sites);
        await setupAlarms(sites);
        console.log("Initial rules and alarms set up.");
    } catch (error) {
        console.error("Error during onInstalled:", error);
    }
});

// Keep the service worker alive when alarms are set.
// This is generally not needed for MV3 as alarms themselves wake the SW.
// However, if complex operations are tied to alarms, this can be a consideration.
// For simple unblocking, it's likely fine.

console.log("Mindful Blocker background script loaded.");
// Test: Log current dynamic rules on startup
chrome.declarativeNetRequest.getDynamicRules().then(rules => {
    console.log("Current dynamic rules on startup:", rules);
});
