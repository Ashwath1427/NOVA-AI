document.addEventListener('DOMContentLoaded', () => {
  const chartContainer = document.getElementById('chart-container');
  const historyTableBody = document.getElementById('history-table-body');
  const historyEmpty = document.getElementById('history-empty');

  chrome.storage.local.get(["dailyUsage", "unlockHistory"], (data) => {
    // 1. Render Screen Time Chart
    const usage = data.dailyUsage || {};
    const sortedUsage = Object.entries(usage).sort((a, b) => b[1] - a[1]);
    
    if (sortedUsage.length === 0) {
      chartContainer.innerHTML = '<p class="empty-state">No screen time data recorded today.</p>';
    } else {
      // Find max value to scale the bars relative to the highest usage
      const maxSeconds = sortedUsage[0][1];
      
      sortedUsage.forEach(([domain, seconds]) => {
        if (seconds > 0) {
          const percentage = Math.max(5, (seconds / maxSeconds) * 100);
          const mins = Math.floor(seconds / 60);
          
          const row = document.createElement('div');
          row.className = 'bar-row';
          
          const label = document.createElement('div');
          label.className = 'bar-label';
          label.innerText = domain;
          label.title = domain; // tooltip
          
          const track = document.createElement('div');
          track.className = 'bar-track';
          
          const fill = document.createElement('div');
          fill.className = 'bar-fill';
          fill.innerText = `${mins}m`;
          
          // Animate in
          setTimeout(() => {
            fill.style.width = `${percentage}%`;
          }, 100);
          
          track.appendChild(fill);
          row.appendChild(label);
          row.appendChild(track);
          chartContainer.appendChild(row);
        }
      });
    }

    // 2. Render Unlock History Table
    const history = data.unlockHistory || [];
    
    if (history.length === 0) {
      historyEmpty.style.display = 'block';
    } else {
      // Sort newest first
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      history.forEach(record => {
        const tr = document.createElement('tr');
        
        const tdDate = document.createElement('td');
        const d = new Date(record.timestamp);
        tdDate.innerText = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
        
        const tdSite = document.createElement('td');
        tdSite.innerText = record.website;
        
        const tdReason = document.createElement('td');
        tdReason.innerText = record.reason;
        
        tr.appendChild(tdDate);
        tr.appendChild(tdSite);
        tr.appendChild(tdReason);
        historyTableBody.appendChild(tr);
      });
    }
  });
});
