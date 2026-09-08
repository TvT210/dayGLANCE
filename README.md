# 考研日历 · 邱松鑫 (dayglance fork)

> Fork 自 [krelltunez/dayglance](https://github.com/krelltunez/dayglance) v4.7.0
> 定制: 考研蓝绿主题 + 标题 + AI 配置

## 🎯 用途

GPNU 网络工程 大三, 2027 考研专用时间管理 PWA。
支持: 月/周/日 视图、增量同步、Android APK、AI 助手 (MiniMax-M3)。

## ⚡ 5 分钟配置 (Web 端)

1. **打开**: https://tvt210.github.io/dayGLANCE/ (GitHub Pages)
2. **首次进入**: 默认是空数据, 需要导入 .ics
   - 打开 `D:\考研\07_学习计划\日程_详细到分钟.ics`
   - 在 dayglance 设置 → "Import Calendar" → 选 .ics → 导入
3. **AI 配置** (用 MiniMax-M3):
   - 设置 → AI → Provider: **Custom (OpenAI-compatible)**
   - Base URL: `https://api.minimaxi.com/v1`
   - API Key: 你自己的 key
   - Model: `MiniMax-M3`
   - 测试连接 → ✅
4. **主题**: 已经改成蓝绿 (MD3 teal)

## 📱 Android APK 打包

(用户云服务器部署 / 本地构建)

```bash
# 1. 在 dayglance-android/ 创建 keystore.properties
cat > dayglance-android/keystore.properties << EOF
KEYSTORE_FILE=kaoyan-release.keystore
KEYSTORE_PASSWORD=your_password
KEY_ALIAS=kaoyan
KEY_PASSWORD=your_password
EOF

# 2. 生成 keystore
keytool -genkey -v -keystore dayglance-android/kaoyan-release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 -alias kaoyan

# 3. 构建
cd dayglance-android
./gradlew assembleRelease

# 产出: app/build/outputs/apk/release/app-release.apk
# 下载到手机, 打开 "允许未知来源", 安装
```

## 🔄 增量同步 (云服务器 Nextcloud)

```bash
# 在你的云服务器上
docker run -d --name nextcloud -p 80:80 \
  -v /data/nextcloud:/var/www/html \
  nextcloud:stable

# 浏览器打开 http://服务器IP, 创建账号
# 在 dayglance 设置 → Sync → Custom WebDAV
# URL: http://服务器IP/remote.php/dav/files/用户名/
# 用户名/密码: Nextcloud 账号
```

## 🏗 架构

```
┌─────────────────────────────────────────────────────────┐
│  你的云服务器                                          │
│                                                         │
│  ┌──────────────────────┐    ┌────────────────────┐    │
│  │ dayglance (PWA)     │    │ Nextcloud WebDAV   │    │
│  │ :6767  nginx+node    │◄──►│ :80   sync 后端   │    │
│  └──────────────────────┘    └────────────────────┘    │
└─────────────────────────────────────────────────────────┘
          ▲
          │ 移动端 (PWA / Android APK)
          │ 电脑端 (PWA / Electron)
```

## 📁 改造文件 (本 fork 改了 4 个)

| 文件 | 改动 |
|------|------|
| `tailwind.config.js` | 品牌色 #fe8b00 → #00695c (MD3 teal) |
| `index.html` | 标题 → "考研日历 · 邱松鑫" |
| `public/theme-init.js` | 主题色 → 蓝绿 |
| `package.json` | name → kaoyan-dayglance |

## 🔗 链接

- **GitHub**: https://github.com/TvT210/dayGLANCE
- **原始项目**: https://github.com/krelltunez/dayglance
- **在线体验**: https://dayglance.app (官方版)

## 📝 License

MIT (继承自 dayglance)
