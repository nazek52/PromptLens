// Opening the panel is a toolbar gesture; no persistent content scripts run.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
