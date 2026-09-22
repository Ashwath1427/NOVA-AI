document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetUrl = urlParams.get('url');
  
  if (targetUrl) {
    document.getElementById('blocked-url').innerText = targetUrl;
  }

  const quotes = [
    '"Discipline is choosing between what you want now and what you want most." - Abraham Lincoln',
    '"Starve your distractions, feed your focus."',
    '"Your future is created by what you do today, not tomorrow."',
    '"Success is the sum of small efforts, repeated day in and day out."'
  ];
  document.getElementById('quote').innerText = quotes[Math.floor(Math.random() * quotes.length)];

  document.getElementById('override-btn').addEventListener('click', () => {
    const reason = (document.getElementById('reason-input')?.value || '').trim() || "Work requirement";

    const unlockRecord = {
      timestamp: new Date().toISOString(),
      website: targetUrl || "Unknown",
      reason: reason
    };

    chrome.storage.local.get(["unlockHistory"], (data) => {
      let history = data.unlockHistory || [];
      history.push(unlockRecord);
      chrome.storage.local.set({ unlockHistory: history }, () => {
        // Send message to background to unblock
        chrome.runtime.sendMessage({ action: "TEMPORARY_UNBLOCK", domain: targetUrl }, (response) => {
          let button = document.getElementById('override-btn');
          button.innerText = "Unblocking...";
          button.disabled = true;

          setTimeout(() => {
            if (targetUrl && targetUrl.startsWith('http')) {
              window.location.href = targetUrl;
            } else if (targetUrl) {
              window.location.href = `https://${targetUrl}`;
            } else {
              window.close();
            }
          }, 1000);
        });
      });
    });
  });
});
