// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const blockSiteForm = document.getElementById('blockSiteForm');
    const siteUrlInput = document.getElementById('siteUrl');
    const blockTypeSelect = document.getElementById('blockType');
    const durationOptionsDiv = document.getElementById('durationOptions');
    const durationMinutesSelect = document.getElementById('durationMinutes');
    const customDurationMinutesInput = document.getElementById('customDurationMinutes');
    const untilTimeOptionsDiv = document.getElementById('untilTimeOptions');
    const unblockTimeInput = document.getElementById('unblockTime');
    const blockedSitesListDiv = document.getElementById('blockedSitesList');
    const noSitesMessage = document.getElementById('noSitesMessage');
    const addOrUpdateSiteBtn = document.getElementById('addOrUpdateSiteBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const editingSiteIdInput = document.getElementById('editingSiteId');

    let currentBlockedSites = [];
    let nextRuleId = 1; // Default, will be loaded from storage

    // Load initial data from storage
    async function loadInitialData() {
        try {
            const data = await chrome.storage.sync.get(['blockedSites', 'nextRuleId']);
            currentBlockedSites = data.blockedSites || [];
            nextRuleId = data.nextRuleId || 1;
            renderBlockedSites();
        } catch (error) {
            console.error("Error loading data from storage:", error);
            showToast("Error loading data.", "error");
        }
    }

    // Render the list of blocked sites
    function renderBlockedSites() {
        blockedSitesListDiv.innerHTML = ''; // Clear existing list

        if (currentBlockedSites.length === 0) {
            if (noSitesMessage) blockedSitesListDiv.appendChild(noSitesMessage);
            noSitesMessage.classList.remove('hidden');
            return;
        }
        noSitesMessage.classList.add('hidden');

        currentBlockedSites.forEach(site => {
            const siteDiv = document.createElement('div');
            siteDiv.className = 'p-3 bg-slate-700 rounded-md shadow flex justify-between items-center';
            
            let Wording = ``;
            if(site.url.length > 20){
                Wording = `${site.url.substring(0, 20)}...`;
            }else{
                Wording = `${site.url}`;
            }

            let timeInfo = '';
            if (site.blockType === 'permanent') {
                timeInfo = 'Blocked permanently';
            } else if (site.unblockTime) {
                const remaining = getRemainingTime(site.unblockTime);
                if (remaining === "Soon" || new Date(site.unblockTime) < new Date()) {
                     timeInfo = `Unblocking soon...`;
                } else {
                    timeInfo = `Unblocks: ${formatDateTime(site.unblockTime)} (${remaining})`;
                }
            }

            siteDiv.innerHTML = `
                <div>
                    <p class="font-semibold text-sky-400">${Wording}</p>
                    <p class="text-xs text-slate-400">${timeInfo}</p>
                </div>
                <div class="space-x-2">
                    <button data-id="${site.id}" class="edit-btn btn btn-secondary btn-sm text-xs p-1.5">Edit</button>
                    <button data-id="${site.id}" class="delete-btn btn btn-danger btn-sm text-xs p-1.5">Delete</button>
                </div>
            `;
            blockedSitesListDiv.appendChild(siteDiv);
        });

        // Add event listeners for new buttons
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', handleEditSite);
        });
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', handleDeleteSite);
        });
    }

    // Handle block type change
    blockTypeSelect.addEventListener('change', () => {
        const type = blockTypeSelect.value;
        durationOptionsDiv.classList.toggle('hidden', type !== 'duration');
        untilTimeOptionsDiv.classList.toggle('hidden', type !== 'untilTime');
        if (type === 'duration') {
            customDurationMinutesInput.classList.toggle('hidden', durationMinutesSelect.value !== 'custom');
        } else {
            customDurationMinutesInput.classList.add('hidden');
        }
    });

    durationMinutesSelect.addEventListener('change', () => {
        customDurationMinutesInput.classList.toggle('hidden', durationMinutesSelect.value !== 'custom');
    });


    // Handle form submission (Add/Update Site)
    blockSiteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const urlToBlock = normalizeUrl(siteUrlInput.value.trim());
        if (!urlToBlock) {
            showToast("Invalid URL format. Please enter a valid URL (e.g., example.com).", "error");
            return;
        }

        const blockType = blockTypeSelect.value;
        let durationMinutes = 0;
        let unblockTime = null; // Timestamp

        if (blockType === 'duration') {
            if (durationMinutesSelect.value === 'custom') {
                durationMinutes = parseInt(customDurationMinutesInput.value, 10);
            } else {
                durationMinutes = parseInt(durationMinutesSelect.value, 10);
            }
            if (isNaN(durationMinutes) || durationMinutes <= 0) {
                showToast("Please enter a valid duration in minutes.", "error");
                return;
            }
            unblockTime = Date.now() + durationMinutes * 60 * 1000;
        } else if (blockType === 'untilTime') {
            const timeValue = unblockTimeInput.value; // "HH:mm"
            if (!timeValue) {
                showToast("Please select an unblock time.", "error");
                return;
            }
            const [hours, minutes] = timeValue.split(':').map(Number);
            const now = new Date();
            const unblockDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
            
            if (unblockDate <= now) { // If time is in the past for today, set for tomorrow
                unblockDate.setDate(unblockDate.getDate() + 1);
            }
            unblockTime = unblockDate.getTime();
        }

        const editingId = editingSiteIdInput.value;
        let siteData;

        if (editingId) { // Editing existing site
            const siteIndex = currentBlockedSites.findIndex(s => s.id === editingId);
            if (siteIndex === -1) {
                showToast("Error finding site to update.", "error");
                return;
            }
            siteData = {
                ...currentBlockedSites[siteIndex],
                url: urlToBlock,
                blockType: blockType,
                durationMinutes: blockType === 'duration' ? durationMinutes : null,
                unblockTime: unblockTime, // This will be null for 'permanent'
            };
            currentBlockedSites[siteIndex] = siteData;
            showToast(`Site ${urlToBlock} updated!`, "success");
        } else { // Adding new site
            // Check if site (normalized URL) is already blocked
            if (currentBlockedSites.some(site => site.url === urlToBlock)) {
                showToast(`${urlToBlock} is already in the block list.`, "error");
                return;
            }
            siteData = {
                id: generateUniqueId(),
                url: urlToBlock,
                blockType: blockType,
                durationMinutes: blockType === 'duration' ? durationMinutes : null,
                unblockTime: unblockTime, // This will be null for 'permanent'
                ruleId: nextRuleId++, // Assign and increment
                isActive: true // New sites are active by default
            };
            currentBlockedSites.push(siteData);
            showToast(`Site ${urlToBlock} added to block list!`, "success");
        }
        
        await saveAndApplyChanges();
        resetForm();
    });

    // Handle Edit Site
    function handleEditSite(event) {
        const siteId = event.target.dataset.id;
        const siteToEdit = currentBlockedSites.find(s => s.id === siteId);
        if (!siteToEdit) return;

        siteUrlInput.value = siteToEdit.url;
        blockTypeSelect.value = siteToEdit.blockType;
        
        // Trigger change to show/hide relevant options
        blockTypeSelect.dispatchEvent(new Event('change')); 

        if (siteToEdit.blockType === 'duration' && siteToEdit.durationMinutes) {
            // Check if it's one of the predefined values
            const predefinedDurations = ["30", "60", "120"];
            if (predefinedDurations.includes(siteToEdit.durationMinutes.toString())) {
                durationMinutesSelect.value = siteToEdit.durationMinutes.toString();
                customDurationMinutesInput.classList.add('hidden');
            } else {
                durationMinutesSelect.value = 'custom';
                customDurationMinutesInput.value = siteToEdit.durationMinutes;
                customDurationMinutesInput.classList.remove('hidden');
            }
        } else if (siteToEdit.blockType === 'untilTime' && siteToEdit.unblockTime) {
            const date = new Date(siteToEdit.unblockTime);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            unblockTimeInput.value = `${hours}:${minutes}`;
        }

        editingSiteIdInput.value = siteId;
        addOrUpdateSiteBtn.textContent = 'Update Site';
        cancelEditBtn.classList.remove('hidden');
        siteUrlInput.focus();
    }
    
    cancelEditBtn.addEventListener('click', resetForm);

    // Handle Delete Site
    async function handleDeleteSite(event) {
        const siteId = event.target.dataset.id;
        const siteToDelete = currentBlockedSites.find(s => s.id === siteId);
        if (!siteToDelete) return;

        currentBlockedSites = currentBlockedSites.filter(s => s.id !== siteId);
        showToast(`Site ${siteToDelete.url} removed.`, "success");
        await saveAndApplyChanges(); // This will also update declarativeNetRequest rules
    }

    // Save changes to storage and notify background script
    async function saveAndApplyChanges() {
        try {
            await chrome.storage.sync.set({ blockedSites: currentBlockedSites, nextRuleId: nextRuleId });
            // Notify background script to update rules and alarms
            await chrome.runtime.sendMessage({ 
                action: "updateRulesAndAlarms", 
                blockedSites: currentBlockedSites 
            });
            renderBlockedSites(); // Re-render the list
        } catch (error) {
            console.error("Error saving changes:", error);
            if (error.message.includes("MAX_WRITE_OPERATIONS_PER_MINUTE")) {
                showToast("Too many changes too quickly. Please wait a moment.", "error");
            } else {
                showToast("Error saving changes.", "error");
            }
        }
    }

    // Reset form to initial state
    function resetForm() {
        blockSiteForm.reset();
        editingSiteIdInput.value = '';
        addOrUpdateSiteBtn.textContent = 'Add Site';
        cancelEditBtn.classList.add('hidden');
        durationOptionsDiv.classList.add('hidden');
        untilTimeOptionsDiv.classList.add('hidden');
        customDurationMinutesInput.classList.add('hidden');
        blockTypeSelect.value = 'permanent'; // Default
    }

    // Initial load
    loadInitialData();

    // Listen for storage changes from other parts of the extension (e.g., background unblocking)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.blockedSites) {
            currentBlockedSites = changes.blockedSites.newValue || [];
            renderBlockedSites(); // Re-render if data changes
        }
        if (namespace === 'sync' && changes.nextRuleId) {
            nextRuleId = changes.nextRuleId.newValue || nextRuleId;
        }
    });

    // Periodically refresh the display of remaining times
    setInterval(() => {
        if (currentBlockedSites.some(site => site.blockType !== 'permanent' && site.unblockTime)) {
            renderBlockedSites();
        }
    }, 30000); // Refresh every 30 seconds
});
