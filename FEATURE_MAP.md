# 功能地图

公开页面在 [index.html](index.html)，共享样式在 [styles.css](styles.css)，本地后台在 [server.py](server.py) 和 [studio.html](studio.html)。当前没有数据库或自动化测试文件。

| 功能 | 源码定位 | 同步检查 |
| --- | --- | --- |
| 首页与主题入口 | `home()`、`topics`、`posts`、`notes`、`projects`，样式 `.hero`、`.feature`、`.home-grid` | 置顶链接、最近列表、主题文章数、窄屏重排 |
| 路由、导航与标题 | `render()`、`hashchange`、`.nav` | 从 URL 直接打开、浏览器返回、活动栏目、未知路由 |
| 归档和筛选 | `archive()`、`row()`、`.filter-bar`、`.pill` | 年份分组、结果计数、重新筛选后的焦点 |
| 文章阅读 | `article()`、`postLink()`、`updateProgress()`、`[data-copy]` | 目录定位、阅读进度、代码复制、表格横滚和相关页 |
| 搜索弹层 | `#search`、`search()`、`openSearch()`、`openResult()`、`#query` 键盘处理 | `/` 或 `Ctrl/Cmd+K`、正文关键词、无结果恢复、方向键、Enter 与 Esc |
| 笔记和项目 | `indexCards()`、`notes`、`projects` | 笔记详情展开，项目跳转的文章 `id` 仍存在 |
| 后台登录 | `server.py` 的 `GET /admin`、`POST /admin/login`、`POST /admin/logout` | 未登录、错误密码、有效会话、退出、直接请求模板 |
| 本地写作台 | `studio.html` 的 `setupStudio()`、`markdownPreview()`、`#draft`、`#export-draft` | 实时渲染、刷新读回草稿、空稿导出禁用、导出 Markdown 原文 |
| 浅色和深色 | `:root`、`[data-theme]`、`updateThemeButton()`、`itfetter-theme` | 系统默认主题、手动切换、刷新恢复、对比度 |
| 本地预览 | [start-preview.bat](start-preview.bat) | 根目录 `index.html` 返回 HTTP 200，端口只在本机监听 |

公开路由格式为 `#home`、`#archive[/主题]`、`#post/文章ID[/小节号]`、`#notes`、`#projects`、`#about`。写作台通过本机 `/admin` 登录进入。搜索读取文章数组，主题与草稿均按浏览器和站点地址保存。
