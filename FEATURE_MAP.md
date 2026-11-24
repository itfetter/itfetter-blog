# 功能地图

公开页面在 [index.html](index.html)，共享样式在 [styles.css](styles.css)，本地后台在 [server.py](server.py)、[studio.html](studio.html) 和 [admin.js](admin.js)。内容写入本地 `blog-data.json`，初始内容在 [content.js](content.js)。

| 功能 | 源码定位 | 同步检查 |
| --- | --- | --- |
| 首页与主题入口 | `home()`、`topics`、`posts`、`notes`、`projects`，样式 `.hero`、`.feature`、`.home-grid` | 置顶链接、最近列表、主题文章数、窄屏重排 |
| 样稿封面与评论 | `index.html` 的 `sampleCovers`、`cover()`，`assets/`，`server.py` 的静态文件映射，`content.js` 的 `comments` | 首页置顶与正文封面、示例标签、归档计数和楼中回复 |
| 站点标志 | `assets/itfetter-icon.svg`、`index.html`、`server.py`、`styles.css` 的 `.mark` | 前台和后台的标签图标及页眉标志 |
| 路由、导航与标题 | `render()`、`navigateToArticle()`、`hashchange`、`.nav` | 文章返回进入时的页面与筛选、恢复搜索、目录跳转后仍能返回入口、直达链接回退归档 |
| 关于本站 | `about()`、`settings`、`.about-page`、`.about-links` | 作者介绍、后台 Markdown、GitHub 链接、推荐文章、移动端单列 |
| 归档和筛选 | `archive()`、`row()`、`.filter-bar`、`.pill` | 年份分组、结果计数、重新筛选后的焦点 |
| 文章阅读 | `article()`、`.article-page`、`#article-return`、`updateProgress()`、`[data-copy]` | 正文与固定返回对齐、桌面固定目录与当前章节、窄屏折叠目录、阅读进度、代码复制和表格横滚 |
| 搜索弹层 | `#search`、`search()`、`openSearch()`、`openResult()`、`#query` 键盘处理 | `/` 或 `Ctrl/Cmd+K`、正文关键词、无结果恢复、方向键、Enter 与 Esc |
| 笔记和项目 | `notesPage()`、`projectsPage()`、`projectCards()`、`admin.js` 的 `openEditor()`、`content_store.py` 的 `update_content()` | 笔记分类和正文展开、项目详情与关联文章、后台 Markdown 保存 |
| 后台登录 | `server.py` 的 `GET /admin`、`POST /admin/login`、`POST /admin/logout` | 未登录、错误密码、有效会话、退出、直接请求模板 |
| 修改后台密码 | 站点设置的「修改登录密码」、`POST /admin/password`、数据目录下的 `admin-password.hash` | 校验当前密码和确认值、新密码至少 6 位、旧会话失效、重启后新密码可用 |
| 后台栏目 | `admin.js` 初始化的 `requestedView` 和 `switchView()` | 栏目切换更新地址，刷新与直达恢复栏目，无效片段回到总览 |
| 内容管理 | `admin.js` 的 `contentList()`、`openEditor()`、`confirmAction()`，`/admin/content`、`content_store.py` 的 `update_content()` | 搜索和状态筛选、文章浏览评论点赞数、新建编辑、撤回及删除确认 |
| 文档编辑 | `admin.js` 的 `articleEditor()`、`snapshot()` 和 `stepHistory()`，`markdown.js` 的 `fromDocument()` 与 `clipboardBlocks()` | 连续输入、粘贴、块菜单贴边定位、选区格式工具栏、选区保留、列表项转换、Markdown 往返及撤销重做 |
| 高亮块与文字配色 | `markdown.js` 的高亮块和行内配色往返、`admin.js` 的选区工具栏、`styles.css` 的高亮块与色板 | 块转换、字体颜色、背景颜色、恢复默认、撤销，编辑、预览和发布一致 |
| 文章表格和封面 | `admin.js` 的尺寸网格和行列操作，`markdown.js` 的表格读写与 `coverImage()`，`content_store.py` 的旧样稿兼容 | 网格选行列数、表格边缘圆点就地插入和删除、撤销、Tab 换格、前台对照、封面与替代文字、窄屏表格独立滚动 |
| 文章发布与草稿 | `admin.js` 的 `contentList()`、`openEditor()` 和 `save()`，`content_store.py` 的 `update_content()`、`public_script()` | 停止输入后自动保存、保存后继续编辑、重复保存更新同一篇、草稿与已发布版本隔离、发布更新、显式撤回 |
| 文章评论 | `index.html` 的 `row()`、`article()`、`mountComments()`，`server.py` 的 `/api/comments`，`content_store.py` 的评论读写和 `public_script()`，`styles.css` 的讨论区样式 | 评论及回复计数、目录跳转、留言和回复、刷新后保留、无评论和接口不可用提示、仅开放已发布文章 |
| 浏览量与点赞 | `index.html` 的 `mountEngagement()`，`server.py` 的 `POST /api/post-stats?post=文章ID`，`content_store.py` 的 `update_engagement()` 和 `public_script()` | 当日按匿名浏览器标识去重、点赞和取消、各页面的计数同步、仅开放已发布文章 |
| 站点设置 | `admin.js` 的 `settingsForm()`、`content_store.py` 的 `public_script()`、`index.html` 的 `settings` | 首页、页脚和关于页同步，置顶关联，静态导出排除草稿 |
| 浅色和深色 | `:root`、`[data-theme]`、`updateThemeButton()`、`itfetter-theme` | 系统默认主题、手动切换、刷新恢复、对比度 |
| 本地预览 | [start-preview.bat](start-preview.bat) | 根目录 `index.html` 返回 HTTP 200，端口只在本机监听 |

公开路由格式为 `#home`、`#archive[/主题]`、`#post/文章ID[/小节号]`、`#notes[/笔记ID]`、`#notes/category/类别`、`#projects[/项目ID]`、`#about`。搜索覆盖已发布的文章、笔记和项目。管理后台通过本机 `/admin` 登录进入。主题偏好按浏览器和站点地址保存，后台草稿保存在项目目录。
