// 背景脚本 - 处理扩展的核心功能

// 默认设置
const DEFAULT_SETTINGS = {
  apiKey: '',
  apiEndpoint: 'https://api.deepseek.com/v1',
  apiModel: 'deepseek-vision-1.0',
  saveDirectory: '/screenshots',
  language: 'zh-CN',
  screenshotInterval: 5
};

// 初始化扩展
chrome.runtime.onInstalled.addListener(() => {
  console.log('截屏分析助手已安装');
  
  // 初始化存储设置
  chrome.storage.local.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
  });
  
  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'screenshot',
    title: '截取并分析此页面',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'openSettings',
    title: '打开设置',
    contexts: ['all']
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'screenshot') {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id });
    
    // 发送消息，通知侧边栏立即截图
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: 'take_screenshot_from_context_menu' });
    }, 500); // 延迟半秒，确保侧边栏已加载
  } else if (info.menuItemId === 'openSettings') {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// 处理快捷键
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'take_screenshot') {
    // 在当前标签页执行截图
    takeScreenshot(tab.id);
  } else if (command === '_execute_action') {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// 截取当前标签页
function captureTab(tabId) {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error('截图失败:', chrome.runtime.lastError);
      return;
    }
    
    const screenshot = {
      id: Date.now().toString(),
      dataUrl: dataUrl,
      timestamp: Date.now(),
      url: ''
    };
    
    // 获取当前页面URL
    chrome.tabs.get(tabId, (tab) => {
      screenshot.url = tab.url;
      
      // 保存截图
      saveScreenshot(screenshot);
    });
  });
}

// 保存截图到本地存储
function saveScreenshot(screenshot, sendResponse) {
  chrome.storage.local.get('screenshots', function(data) {
    const screenshots = data.screenshots || [];
    
    // 检查是否已经存在相同ID的截图
    const existingIndex = screenshots.findIndex(s => s.id === screenshot.id);
    if (existingIndex !== -1) {
      console.log("截图ID已存在，不重复添加:", screenshot.id);
      if (sendResponse) {
        sendResponse({ success: true, screenshotId: screenshot.id, isExisting: true });
      }
      return;
    }
    
    // 添加新截图到列表开头，实现倒序排列
    screenshots.unshift(screenshot);
    
    chrome.storage.local.set({ screenshots: screenshots }, function() {
      // 通知侧边栏新的截图已添加
      chrome.runtime.sendMessage({
        action: 'screenshot_added',
        screenshot: screenshot
      });
      
      if (sendResponse) {
        sendResponse({ success: true, screenshotId: screenshot.id });
      }
    });
  });
}

// 自动截图计时器
let autoScreenshotTimers = {};
let autoScreenshotStates = {};

// 处理消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log("Received message:", message);
  
  // 处理不同的消息动作
  switch (message.action) {
    case 'take_screenshot':
      // 如果没有提供sender.tab（可能是从弹出窗口发送的），获取当前活动标签页
      if (!sender.tab) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs.length > 0) {
            takeScreenshot(tabs[0].id, sendResponse);
          } else {
            sendResponse({success: false, error: "未能获取当前标签页"});
          }
        });
      } else {
        takeScreenshot(sender.tab.id, sendResponse);
      }
      return true; // 异步响应
    
    case 'start_auto_screenshot':
      if (!sender.tab) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs.length > 0) {
            startAutoScreenshot(tabs[0].id, message.interval, sendResponse);
          } else {
            sendResponse({success: false, error: "未能获取当前标签页"});
          }
        });
      } else {
        startAutoScreenshot(sender.tab.id, message.interval, sendResponse);
      }
      return true; // 异步响应
    
    case 'stop_auto_screenshot':
      if (!sender.tab) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs.length > 0) {
            stopAutoScreenshot(tabs[0].id, sendResponse);
          } else {
            sendResponse({success: false, error: "未能获取当前标签页"});
          }
        });
      } else {
        stopAutoScreenshot(sender.tab.id, sendResponse);
      }
      return true; // 异步响应
    
    case 'delete_screenshot':
      deleteScreenshot(message.id, sendResponse);
      return true; // 异步响应
    
    case 'open_settings':
      // 打开侧边栏并跳转到设置
      if (!sender.tab) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs.length > 0) {
            chrome.sidePanel.open({ tabId: tabs[0].id });
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'open_settings' });
            }, 300);
          }
        });
      } else {
        chrome.sidePanel.open({ tabId: sender.tab.id });
        setTimeout(() => {
          chrome.tabs.sendMessage(sender.tab.id, { action: 'open_settings' });
        }, 300);
      }
      sendResponse({ success: true });
      return false;
    
    case 'open_sidebar':
      // 打开侧边栏
      let tabIdToOpen = message.tabId;
      if (!tabIdToOpen && sender.tab) {
        tabIdToOpen = sender.tab.id;
      }
      if (!tabIdToOpen) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs && tabs.length > 0) {
            chrome.sidePanel.open({ tabId: tabs[0].id });
          }
        });
      } else {
        chrome.sidePanel.open({ tabId: tabIdToOpen });
      }
      sendResponse({ success: true });
      return false;
  }
});

// 处理扩展图标点击
chrome.action.onClicked.addListener((tab) => {
  // 打开侧边栏
  chrome.sidePanel.open({ tabId: tab.id });
});

// 截取屏幕截图
function takeScreenshot(tabId, sendResponse) {
  console.log("Taking screenshot for tab ID:", tabId);
  
  // 使用null作为windowId参数，截取当前活动窗口的截图
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, function(dataUrl) {
    if (chrome.runtime.lastError) {
      console.error("Screenshot capture error:", chrome.runtime.lastError);
      if (sendResponse) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      }
      return;
    }
    
    // 获取当前标签页信息
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.runtime.lastError) {
        console.error("Error getting tab info:", chrome.runtime.lastError);
        
        // 创建一个基本的截图对象，即使没有获取到标签页信息
        const screenshot = {
          id: Date.now().toString(),
          dataUrl: dataUrl,
          timestamp: Date.now(),
          url: "unknown",
          title: "未知页面"
        };
        
        // 保存截图
        saveScreenshot(screenshot, sendResponse);
        return;
      }
      
      // 创建截图对象
      const screenshot = {
        id: Date.now().toString(),
        dataUrl: dataUrl,
        timestamp: Date.now(),
        url: tab.url,
        title: tab.title || "未命名页面"
      };
      
      console.log("Screenshot captured successfully, saving...");
      
      // 保存截图
      saveScreenshot(screenshot, sendResponse);
    });
  });
}

// 开始自动截图
function startAutoScreenshot(tabId, interval, sendResponse) {
  console.log("Starting auto screenshot for tab ID:", tabId, "with interval:", interval, "minutes");
  
  // 检查标签页是否仍然存在
  chrome.tabs.get(tabId, function(tab) {
    if (chrome.runtime.lastError) {
      console.error("Tab no longer exists:", chrome.runtime.lastError);
      if (sendResponse) {
        sendResponse({ success: false, error: "标签页已关闭" });
      }
      return;
    }
    
    // 停止之前可能存在的计时器
    stopAutoScreenshot(tabId);
    
    const intervalMs = (interval || 5) * 60 * 1000; // 转换为毫秒
    
    // 立即执行一次截图
    takeScreenshot(tabId, function(response) {
      if (!response || !response.success) {
        console.error("Initial screenshot failed:", response);
        if (sendResponse) {
          sendResponse({ success: false, error: "初始截图失败" });
        }
        return;
      }
      
      // 设置新的计时器
      autoScreenshotTimers[tabId] = setInterval(function() {
        // 检查标签页是否仍然存在
        chrome.tabs.get(tabId, function(tab) {
          if (chrome.runtime.lastError) {
            console.error("Tab no longer exists during auto screenshot:", chrome.runtime.lastError);
            stopAutoScreenshot(tabId);
            return;
          }
          
          console.log("Auto screenshot timer triggered for tab ID:", tabId);
          takeScreenshot(tabId);
        });
      }, intervalMs);
      
      // 记录状态
      autoScreenshotStates[tabId] = {
        interval: interval,
        startTime: Date.now(),
        lastScreenshot: Date.now()
      };
      
      if (sendResponse) {
        sendResponse({ success: true });
      }
    });
  });
}

// 停止自动截图
function stopAutoScreenshot(tabId, sendResponse) {
  console.log("Stopping auto screenshot for tab ID:", tabId);
  
  if (autoScreenshotTimers[tabId]) {
    clearInterval(autoScreenshotTimers[tabId]);
    delete autoScreenshotTimers[tabId];
  }
  
  delete autoScreenshotStates[tabId];
  
  if (sendResponse) {
    sendResponse({ success: true });
  }
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener(function(tabId) {
  if (autoScreenshotTimers[tabId]) {
    stopAutoScreenshot(tabId);
  }
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && autoScreenshotTimers[tabId]) {
    // 如果标签页重新加载完成，重新开始自动截图
    const state = autoScreenshotStates[tabId];
    if (state) {
      startAutoScreenshot(tabId, state.interval);
    }
  }
});

// 删除截图
function deleteScreenshot(id, sendResponse) {
  chrome.storage.local.get('screenshots', function(data) {
    if (!data.screenshots) {
      if (sendResponse) {
        sendResponse({ success: false, error: '没有截图' });
      }
      return;
    }
    
    // 过滤掉要删除的截图
    const screenshots = data.screenshots.filter(s => s.id !== id);
    
    chrome.storage.local.set({ screenshots: screenshots }, function() {
      if (sendResponse) {
        sendResponse({ success: true });
      }
    });
  });
} 