// background.js - FocusForge Real-Time Distraction Blocker

// Initial state with full distraction shield
const defaultSettings = {
  blocklist: [
    "instagram.com",
    "youtube.com",
    "reddit.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "netflix.com",
    "discord.com"
  ],
  dailyUsage: {},
  focusSessions: [],
  points: 50,
  level: "Novice",
  streak: 1,
  settings: { dailyGoal: 7200, sessionLength: 25 * 60 } // seconds
};

// Initialize Storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (data) => {
    if (Object.keys(data).length === 0 || !data.blocklist) {
      chrome.storage.local.set(defaultSettings);
    }
    updateBlockingRules();
  });
});

// Focus Session State
let isFocusActive = false;
let sessionEndTime = 0;

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focus_session_end") {
    endFocusSession(true);
  }
});

// Update DeclarativeNetRequest Rules dynamically based on blocklist and focus state
async function updateBlockingRules() {
  const data = await chrome.storage.local.get(["blocklist"]);
  let blocklist = data.blocklist || [];
  if (!blocklist || blocklist.length === 0) {
    blocklist = defaultSettings.blocklist;
  }
  
  // Note: extensionPath must not have query strings in Manifest V3
  const rules = blocklist.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/blocked.html" }
    },
    condition: {
      urlFilter: domain,
      resourceTypes: ["main_frame"]
    }
  }));

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(r => r.id);

    if (isFocusActive) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: rules
      });
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds
      });
    }
  } catch (err) {
    console.warn("DeclarativeNetRequest rule update:", err);
  }
}

// Redirect any open tabs matching blocked sites
function scanAndBlockActiveTabs() {
  chrome.tabs.query({}, (tabs) => {
    chrome.storage.local.get(["blocklist"], (data) => {
      const list = data.blocklist || defaultSettings.blocklist;
      for (const tab of tabs) {
        if (tab.url && !tab.url.includes(chrome.runtime.id)) {
          for (const domain of list) {
            if (tab.url.toLowerCase().includes(domain.toLowerCase())) {
              chrome.tabs.update(tab.id, {
                url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(domain)}`)
              });
              break;
            }
          }
        }
      }
    });
  });
}

// Message handlers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_FOCUS") {
    const durationSec = request.duration || (25 * 60);
    const durationMs = durationSec * 1000;
    sessionEndTime = Date.now() + durationMs;
    isFocusActive = true;
    
    chrome.alarms.create("focus_session_end", { delayInMinutes: durationSec / 60 });
    updateBlockingRules();
    scanAndBlockActiveTabs();
    
    sendResponse({ success: true, sessionEndTime });
  } else if (request.action === "STOP_FOCUS") {
    endFocusSession(false);
    sendResponse({ success: true });
  } else if (request.action === "GET_FOCUS_STATE") {
    sendResponse({ isFocusActive, sessionEndTime });
  } else if (request.action === "TEMPORARY_UNBLOCK") {
    // Unblock domain for 10 minutes (NO PASSWORD REQUIRED)
    const domain = request.domain;
    chrome.storage.local.get(["blocklist"], (data) => {
      let blocklist = data.blocklist || defaultSettings.blocklist;
      const ruleIdToRemove = blocklist.indexOf(domain) + 1;
      if (ruleIdToRemove > 0) {
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [ruleIdToRemove]
        });
        
        setTimeout(() => {
          if (isFocusActive) updateBlockingRules();
        }, 600000);
      }
    });
    sendResponse({ success: true });
  }
  return true;
});

async function endFocusSession(completed) {
  isFocusActive = false;
  sessionEndTime = 0;
  chrome.alarms.clear("focus_session_end");
  updateBlockingRules();

  if (completed) {
    // Gamification Updates
    const data = await chrome.storage.local.get(["points", "level", "focusSessions"]);
    let points = data.points || 0;
    let focusSessions = data.focusSessions || [];
    
    let earnedPoints = 10;
    points += earnedPoints;
    let level = "Novice";
    if (points >= 3000) level = "Legend";
    else if (points >= 1500) level = "Master";
    else if (points >= 500) level = "Apprentice";

    focusSessions.push({ date: new Date().toISOString().split('T')[0], duration: 25 * 60, completed: true });
    
    await chrome.storage.local.set({ 
      points, 
      level, 
      focusSessions,
      unclaimedReward: true,
      lastRewardPoints: earnedPoints
    });
    
    // Notify User
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "FocusForge",
      message: "Focus session complete! +10 points 🔥"
    });
  }
}

// Time Tracking
let currentTabId = null;
let currentDomain = null;
let lastTimeUpdated = Date.now();

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateTime();
  currentTabId = activeInfo.tabId;
  checkTabDomain(currentTabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabId && changeInfo.url) {
    updateTime();
    checkTabDomain(currentTabId);
  }

  // Active Focus Mode Real-Time Distraction Blocker
  if (isFocusActive && (changeInfo.url || tab.url)) {
    const targetUrl = changeInfo.url || tab.url;
    if (targetUrl && !targetUrl.includes(chrome.runtime.id)) {
      chrome.storage.local.get(["blocklist"], (data) => {
        const list = data.blocklist || defaultSettings.blocklist;
        for (const domain of list) {
          if (targetUrl.toLowerCase().includes(domain.toLowerCase())) {
            chrome.tabs.update(tabId, {
              url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(domain)}`)
            });
            break;
          }
        }
      });
    }
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    updateTime();
    currentTabId = null;
    currentDomain = null;
  } else {
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      if (tabs[0]) {
        updateTime();
        currentTabId = tabs[0].id;
        checkTabDomain(currentTabId);
      }
    });
  }
});

function getDomain(url) {
  try {
    let hostname = new URL(url).hostname;
    hostname = hostname.replace(/^www\./, '');
    return hostname;
  } catch (e) {
    return null;
  }
}

function checkTabDomain(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url) {
      currentDomain = null;
      return;
    }
    currentDomain = getDomain(tab.url);
    lastTimeUpdated = Date.now();
  });
}

function updateTime() {
  if (currentDomain && lastTimeUpdated) {
    const timeSpent = Math.floor((Date.now() - lastTimeUpdated) / 1000); // in seconds
    if (timeSpent > 0 && timeSpent < 3600 * 2) { // sanity check
      chrome.storage.local.get(["dailyUsage"], (data) => {
        let dailyUsage = data.dailyUsage || {};
        dailyUsage[currentDomain] = (dailyUsage[currentDomain] || 0) + timeSpent;
        chrome.storage.local.set({ dailyUsage });
      });
    }
  }
  lastTimeUpdated = Date.now();
}

// Initial time tracking setup
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    currentTabId = tabs[0].id;
    checkTabDomain(currentTabId);
  }
});

// Periodic saving just in case
setInterval(() => {
  updateTime();
}, 10000);
