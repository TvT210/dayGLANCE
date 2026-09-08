try {
  if (JSON.parse(localStorage.getItem('day-planner-darkmode'))) {
    // 考研蓝绿暗色主题
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0f3a3e');
    document.documentElement.style.backgroundColor = '#0f3a3e';
    document.documentElement.classList.add('dark');
  } else {
    // 考研蓝绿色 (Material Design 3 teal)
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#00695c');
    document.documentElement.style.backgroundColor = '#e0f2f1';
  }
} catch(e) {}
