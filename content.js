window.blogContent = {
  "topics": {
    "ai": "AI 体验",
    "dev": "个人开发",
    "note": "随手记"
  },
  "posts": [
    {
      "status": "published",
      "sample": true,
      "id": "markdown-preview-roundtrip",
      "title": "给 Markdown 预览做一次来回检查",
      "date": "2026-11-23",
      "summary": "用同一份笔记检查编辑、预览和导出，再用一段短脚本统计代码围栏。",
      "body": "## 准备一份有代表性的笔记\n\n包含一个标题、两层列表、一段行内代码和一个多行代码块。分别从源码模式和文档模式打开，关注列表层级和换行。\n\n## 检查导出的 Markdown\n\n下面的 Python 脚本列出三反引号所在的行，用来手工对照导出前后的结果。\n\n```python\nfrom pathlib import Path\n\nnote = Path('dev-note.md').read_text(encoding='utf-8')\nfences = [\n    number\n    for number, line in enumerate(note.splitlines(), start=1)\n    if line.lstrip().startswith('```')\n]\nprint('代码围栏所在行：', fences)\n```\n\n## 回到预览再看一遍\n\n在另一个编辑器重新打开导出文件，核对正文顺序。最后回到文章页复制代码块，检查空格和缩进能否一起保留。",
      "topic": "dev"
    },
    {
      "status": "published",
      "sample": true,
      "id": "read-local-preview-metrics",
      "title": "看一次页面加载，把慢在哪里记下来",
      "date": "2026-11-22",
      "summary": "用浏览器自带的 Performance 接口记录加载时间，再按资源类型排查。",
      "body": "## 先记录一次普通访问\n\n打开本地首页和一篇带图文章，各记录一次页面导航时间。一次慢加载可能只是网络抖动，多记一两次才好比较。\n\n## 用代码读取导航时间\n\n下面的片段读取当前页面的导航数据，可以在浏览器控制台运行。\n\n```js\nconst [navigation] = performance.getEntriesByType('navigation');\nif (navigation) {\n  console.table({\n    responseMs: Math.round(navigation.responseEnd),\n    interactiveMs: Math.round(navigation.domInteractive),\n    loadedMs: Math.round(navigation.loadEventEnd)\n  });\n}\n```\n\n## 单独看图片大小\n\n对比首页封面和正文图的实际传输大小，再看首屏有没有加载用不到的图。把最明显的一项写进下一次迭代。",
      "topic": "dev"
    },
    {
      "status": "published",
      "sample": true,
      "id": "local-preview-release-checklist",
      "topic": "dev",
      "date": "2026-11-23",
      "title": "给本地预览做一份发布前清单",
      "summary": "从首页、文章、笔记到手机宽度，记录每次发版前真正需要复查的几条路径。",
      "body": "## 按读者的动作来排检查\n\n我从首页打开一篇文章，跳到讨论区，再点返回。随后从带筛选的归档重复一次。两条路径的目标不同，所以分别写出预期页面，也顺便看刷新后是否还在原来的位置。\n\n## 内容不足的页面也要打开\n\n样稿能帮助检查列表密度、标题折行和评论串。再找一篇零评论文章和一条没有正文的笔记，看页面给出来的状态是不是自然。发布前则把示例作者和示例数据逐条过一遍。\n\n## 留下最短的检查记录\n\n我把检查结果分成读者端和写作台两行。前台记录手机宽度、浏览路径与评论计数，后台记录草稿与已发布内容是否隔离。下次改动时就知道要重新跑哪一组。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "ai-draft-review-session",
      "topic": "ai",
      "date": "2026-11-21",
      "title": "让 AI 帮我审一遍改动，哪些意见值得留",
      "summary": "用同一次小改动比较两种审查提示，记录能复核的建议与泛泛而谈的意见。",
      "body": "## 先给它一份能读懂的改动\n\n这次只处理搜索弹层的空状态和键盘路径。我提供改动前后的操作步骤、预期结果，以及涉及的文件，再请工具按影响程度列问题。\n\n## 只保留能重复验证的意见\n\n「交互不够顺滑」很难行动。「输入一个不存在的词，再按清空按钮，光标应该回到输入框」则能当场检查，也能在下次修改时重新使用。\n\n## 把已验证和待确认分开\n\n手动检查过的路径写进记录，缺少数据或环境的场景单独标明。评审文本的长度不重要，重要的是能否交给另一个人重新走一遍。"
    },
    {
      "id": "working-with-coding-agents",
      "topic": "ai",
      "date": "2026-11-18",
      "title": "把 AI 编程接进日常之后",
      "summary": "从理解项目到审查提交，一套可以反复用的协作流程。",
      "body": "## 先约定交付长什么样\n\n同样是「修一下列表」，可能指移动端溢出，也可能指排序结果不对。发任务前，写下从哪里进入、操作到哪一步、预期看到什么。验收描述越具体，后面越容易判断改动是否跑偏。\n\n## 把理解和修改拆开\n\n先让工具定位入口和已有的验证命令，再动手改一件事。读提交时从用户入口开始，沿着数据走到最终状态，确认每一步仍符合现有行为。\n\n## 留一份能接力的记录\n\n结束时记下这次跑过的命令、手动试过的步骤，以及仍需确认的地方。隔几天回看时，这几行比整段对话更容易用。\n\n```\n已验证：空列表、长标题、移动端折行\n待确认：生产数据下的分页表现\n```\n\n## 用验收表比较两次尝试\n\n下面用一个文章列表展示如何逐项核对结果。每项都写成能重做的操作，方便检查提示词的变化到底解决了什么。",
      "status": "published",
      "sample": true
    },
    {
      "id": "small-tool-first-release",
      "topic": "dev",
      "date": "2026-11-12",
      "title": "一个小工具的第一个可用版本",
      "summary": "先做通最常用的一条路径，再决定哪些想法值得继续做。",
      "body": "## 从手工做过的任务开始\n\n拿三条真实记录跑一遍原来的流程。先记下最耗时的那一步，例如每周重复把一组链接整理成可发给同事的清单。它就是首版要解决的问题。\n\n## 让失败也有下一步\n\n粘贴内容里混有空行时可以照常整理。遇到无法识别的地址，直接指出具体是哪一行，让用户修改后继续。\n\n## 把交付条件写下来\n\n从空白页面开始，粘贴、预览、复制，三步可以完成一次真实任务。再把这条路径交给第一次看到工具的人试一遍。",
      "status": "published",
      "sample": true
    },
    {
      "id": "notes-worth-keeping",
      "topic": "note",
      "date": "2026-11-06",
      "title": "给试过的东西留一份笔记",
      "summary": "记录当时想解决的问题，以及哪些尝试值得下次复用。",
      "body": "## 把具体问题写在开头\n\n「尝试了一个新工具」很难在下次遇到问题时搜出来。标题写成「怎么把浏览器里的片段整理成 Markdown」，以后还能用自己的话把它找回来。\n\n## 留下结果和条件\n\n记下用的输入、耗时，以及哪一步仍然要手工处理。短笔记也可以用这三个信息交代清楚一次实验。\n\n## 复用时补充一行\n\n第二次用同一方法时，把变化追加到原来的笔记。几次积累之后，就能看清哪些步骤适合做进工具。",
      "status": "published",
      "sample": true
    },
    {
      "id": "same-task-two-prompts",
      "topic": "ai",
      "date": "2026-10-29",
      "title": "用同一个任务比较两种提示写法",
      "summary": "从输出的可验证性和返工次数评估一次提示调整。",
      "body": "## 固定输入\n\n选一段能快速验收的文档，保留相同的原文和输出格式。第一种提示只给任务，第二种加上范围和验收条件。\n\n## 看得见的比较\n\n逐项标记输出里哪些内容能从原文核对，再记下补充指令的次数。换几个不同题材的样本，才容易看出哪些条件确实值得保留。",
      "status": "published",
      "sample": true
    },
    {
      "id": "bookmark-export",
      "topic": "dev",
      "date": "2026-10-17",
      "title": "写一个浏览器书签整理脚本",
      "summary": "用现成的书签导出文件验证整理规则。",
      "body": "## 保留原始文件\n\n先把浏览器导出的书签文件留作备份。整理脚本读取副本并输出一张清单，便于对比原有的文件夹层级。\n\n## 检查重复和标题\n\n同一网址可能有不同的名字，也可能被放进多个文件夹。先在预览里展示这些差异，再决定哪些条目适合合并。",
      "status": "published",
      "sample": true
    },
    {
      "id": "weekly-review",
      "topic": "note",
      "date": "2025-12-21",
      "title": "周末项目的一次简单复盘",
      "summary": "把下次打开仓库时最有用的三件事写下来。",
      "body": "## 先记现在能做什么\n\n打开项目，从使用者的视角把能做成的那件事完整走一遍。把入口、数据和关键操作写在同一处，给下一次工作留个起点。\n\n## 给下次留一个可完成的任务\n\n选一个两小时内能验证的改动，记录它解决的使用问题和验收步骤。下次从这里开始，会比重新规划整周容易。",
      "status": "published",
      "sample": true
    }
  ],
  "notes": [
    {
      "status": "published",
      "sample": true,
      "id": "note-js-list-sort",
      "date": "2026-11-23",
      "kind": "开发便笺",
      "title": "按日期排笔记，先复制数组",
      "text": "首页和归档共用源数据时，复制后再排序能避免修改原顺序。",
      "detail": "`YYYY-MM-DD` 可以按字符串排序。\n\n```js\nconst recent = [...notes]\n  .sort((a, b) => b.date.localeCompare(a.date))\n  .slice(0, 5);\n```"
    },
    {
      "status": "published",
      "sample": true,
      "id": "note-check-markdown-fence",
      "date": "2026-11-22",
      "kind": "写作方法",
      "title": "写代码示例时顺手留一份输入",
      "text": "给复制代码的人留一个小输入和预期结果，方便自己先跑一遍。",
      "detail": "例如，验证一个简单的文本清洗函数。\n\n```python\ndef unique_lines(text):\n    return list(dict.fromkeys(text.splitlines()))\n\nassert unique_lines('a\\nb\\na') == ['a', 'b']\n```"
    },
    {
      "status": "published",
      "sample": true,
      "id": "note-search-focus",
      "date": "2026-11-23",
      "kind": "开发便笺",
      "title": "搜索清空后，把光标放回输入框",
      "text": "无结果时点击清空，下一步通常还是输入关键词。",
      "detail": "用「完全匹配不到」作为关键词，按清空后立即键入新词。页面应直接出现新结果。再按 `Esc` 检查焦点是否回到打开搜索的按钮。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "note-model-input",
      "date": "2026-11-22",
      "kind": "AI 实测",
      "title": "比较模型前，先固定输入",
      "text": "同一次实验保留问题、输入材料和验收条件，方便下次重跑。",
      "detail": "我会把对话压到一页，只保留任务、背景和输出约束。每轮只改一个变量。\n\n- 记录模型和日期\n- 保留原输入与失败示例\n- 用同一份验收条件比较输出"
    },
    {
      "status": "published",
      "sample": true,
      "id": "note-phone-check",
      "date": "2026-11-21",
      "kind": "开发便笺",
      "title": "手机宽度下先检查长标题",
      "text": "用包含中英文、数字和长文件名的标题检查列表。",
      "detail": "先以 `390px` 宽度打开归档，再进入正文和评论区。标题、日期、评论数应该自然换行。代码块可以内部横向滚动，整页应该保持在视口内。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "note-project-log",
      "date": "2026-11-19",
      "kind": "写作方法",
      "title": "项目复盘留三句话就够",
      "text": "写下做成了什么、为什么删掉某个需求、下一次先修哪里。",
      "detail": "发布后补记一条真实反馈，尤其是读者在哪个步骤卡住。等到下一次更新，再把当时的决定和现在的结果对照起来。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "note-markdown-export",
      "date": "2026-11-16",
      "kind": "开发便笺",
      "title": "导出 Markdown 后再打开一次",
      "text": "用普通文本编辑器验证标题、代码块和换行是否还在。",
      "detail": "检查一篇同时包含列表和 `inline code` 的草稿。导出后在另一种编辑器打开，确认段落顺序和代码围栏与预览一致。"
    },
    {
      "kind": "写作方法",
      "date": "2026-11-20",
      "title": "把 AI 实测写成能重做的记录",
      "text": "留住任务输入、验收步骤和失败示例。换一个工具时还能复用这份记录。",
      "detail": "先固定一份输入，再各跑一次相同任务。把人工返工拆成补上下文、改实现和补验证，记录每一步的耗时。",
      "id": "notes-1",
      "status": "published"
    },
    {
      "kind": "开发便笺",
      "date": "2026-11-10",
      "title": "空状态也跑一遍真实操作",
      "text": "用空仓库、空文件和正常输入各试一次，看看页面是否说明了下一步。",
      "detail": "用可执行的文案替换「暂无数据」。例如「还没有书签，粘贴一组链接开始整理」。",
      "id": "notes-2",
      "status": "published"
    }
  ],
  "projects": [
    {
      "status": "published",
      "sample": true,
      "id": "project-markdown-preview",
      "kind": "迭代中",
      "title": "Markdown 预览工具",
      "text": "把 Markdown 源码、渲染结果和导出检查放在同一个小工具里。",
      "post": "markdown-preview-roundtrip",
      "detail": "## 目前能做什么\n\n预览标题、列表、代码块和行内代码。验证时先复制一段代码，再导出 Markdown 给另一个编辑器打开。\n\n## 调试示例\n\n```js\nconst lines = markdown.split(/\\r?\\n/);\nconst nonEmpty = lines.filter(line => line.trim());\nconsole.log(`${nonEmpty.length} 行非空内容`);\n```\n\n## 下一步\n\n将跨编辑器的差异写成两三个能重复运行的样本。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "project-blog-workbench",
      "kind": "迭代中",
      "title": "开发手记写作台",
      "text": "用一个本地后台管理文章、笔记、项目和站点设置，再把已发布内容交给静态站点。",
      "post": "local-preview-release-checklist",
      "detail": "## 已完成\n\n文章支持文档编辑、Markdown 源码和预览，停笔后自动存为草稿。读者端可以按主题浏览文章，也可以从目录跳到评论区。\n\n## 下一步\n\n用一篇正式文章走完写作、发布和静态导出，记下最费时间的步骤。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "project-ai-run-log",
      "kind": "原型",
      "title": "AI 实测记录模板",
      "text": "为一次 AI 工具体验记录任务、材料、验收步骤和失败实例。",
      "post": "ai-draft-review-session",
      "detail": "## 解决的问题\n\n零散的对话截图很难重做。模板先保留原问题，再记录每次尝试改了哪条约束，最后附上能复核的输出。\n\n## 当前进度\n\n已有一套 Markdown 记录结构。下一轮打算用相同任务跑两次，检查记录是否足够别人复用。"
    },
    {
      "status": "published",
      "sample": true,
      "id": "project-preview-checks",
      "kind": "计划中",
      "title": "本地博客发布前检查表",
      "text": "把首页、归档、笔记、评论区和手机端的主要路径整理成可重复的检查步骤。",
      "post": "local-preview-release-checklist",
      "detail": "## 第一版范围\n\n- 从首页和分类归档各打开一篇文章\n- 在笔记页筛选、展开和刷新\n- 检查手机宽度下的长标题和代码块\n\n先用人工检查表记录结果，再考虑哪些步骤值得自动化。"
    },
    {
      "kind": "项目构想",
      "title": "浏览器书签整理器",
      "text": "把网址清单变成一份可以检查、去重和复制的分享列表。",
      "post": "bookmark-export",
      "id": "projects-1",
      "status": "published"
    },
    {
      "kind": "流程样例",
      "title": "AI 协作验收清单",
      "text": "记录变更范围、复核步骤和未验证事项，给下一轮开发留一个清楚的起点。",
      "post": "working-with-coding-agents",
      "id": "projects-2",
      "status": "published"
    }
  ],
  "comments": {
    "markdown-preview-roundtrip": [
      {
        "id": "sample-markdown-copy",
        "author": "阿简",
        "body": "我还加了一个 Tab 缩进和行尾空格。跨编辑器时，这两类变化都容易漏掉。",
        "parent": "",
        "created": "2026-11-23T05:10:00Z",
        "sample": true
      },
      {
        "id": "sample-markdown-copy-reply",
        "author": "小周",
        "body": "我会把原文和复制出来的内容都放进 `diff` 对一下。复制以后格式还在也得检查。",
        "parent": "sample-markdown-copy",
        "created": "2026-11-23T05:38:00Z",
        "sample": true
      },
      {
        "id": "sample-markdown-case",
        "author": "林栩",
        "body": "代码本身包含三反引号时，可以用更长的围栏包住示例。",
        "parent": "",
        "created": "2026-11-23T06:26:00Z",
        "sample": true
      }
    ],
    "read-local-preview-metrics": [
      {
        "id": "sample-metrics-reload",
        "author": "沈河",
        "body": "记一次普通加载、一次刷新很有用。我之前只看刷新后的数据，漏算了第一次访问的图片。",
        "parent": "",
        "created": "2026-11-23T04:30:00Z",
        "sample": true
      },
      {
        "id": "sample-metrics-reload-reply",
        "author": "阿简",
        "body": "我会顺手记下刷新方式，避免把普通刷新和清缓存后的数字放在一列。",
        "parent": "sample-metrics-reload",
        "created": "2026-11-23T04:47:00Z",
        "sample": true
      }
    ],
    "notes-worth-keeping": [
      {
        "id": "sample-notes-conditions",
        "author": "许舟",
        "body": "短笔记里保留输入和环境就很实用。我喜欢在开头写清楚当时具体卡在哪一步。",
        "parent": "",
        "created": "2026-11-23T03:44:00Z",
        "sample": true
      }
    ],
    "ai-draft-review-session": [
      {
        "id": "sample-review-verify",
        "author": "小周",
        "body": "把「按哪个按钮」写清之后，审查意见好验证。我用同一组操作对照改动前后。",
        "parent": "",
        "created": "2026-11-23T07:12:00Z",
        "sample": true
      },
      {
        "id": "sample-review-verify-reply",
        "author": "林栩",
        "body": "我会标记哪条结论只看了代码、哪条实际点过页面。",
        "parent": "sample-review-verify",
        "created": "2026-11-23T07:43:00Z",
        "sample": true
      }
    ],
    "local-preview-release-checklist": [
      {
        "id": "sample-checklist-route",
        "author": "小周",
        "body": "我把「从筛选后的归档返回」也放进了每次发布前的检查。这个状态平时很容易漏。",
        "parent": "",
        "created": "2026-11-23T02:15:00Z",
        "sample": true
      },
      {
        "id": "sample-checklist-route-reply",
        "author": "阿简",
        "body": "再补一条在 `390px` 宽度点目录，确认标题没有被顶部导航挡住。",
        "parent": "sample-checklist-route",
        "created": "2026-11-23T03:22:00Z",
        "sample": true
      }
    ],
    "working-with-coding-agents": [
      {
        "id": "sample-ai-scope",
        "author": "小周",
        "body": "我也开始先写验收步骤。以前只交代「改好筛选」，后来补上「清空再选一次」，才发现列表会带着上一次的条件。",
        "parent": "",
        "created": "2026-11-19T02:20:00Z",
        "sample": true
      },
      {
        "id": "sample-ai-scope-reply",
        "author": "阿简",
        "body": "我在 `README.md` 里留了一个三步复现，把空列表和已有数据各跑一遍。换工具之后也能照着走。",
        "parent": "sample-ai-scope",
        "created": "2026-11-19T04:11:00Z",
        "sample": true
      },
      {
        "id": "sample-ai-review",
        "author": "林栩",
        "body": "想请教一下，遇到 AI 顺手改了范围之外的文件，你们通常会先撤掉这些改动，还是先保留一份 diff 再处理？",
        "parent": "",
        "created": "2026-11-20T12:35:00Z",
        "sample": true
      },
      {
        "id": "sample-ai-review-reply",
        "author": "许舟",
        "body": "我先用 `git diff --stat` 确认每个文件为什么变了，然后只摘出这次要交付的部分。顺手发现的问题单独记下来。",
        "parent": "sample-ai-review",
        "created": "2026-11-20T13:10:00Z",
        "sample": true
      }
    ],
    "small-tool-first-release": [
      {
        "id": "sample-tool-scope",
        "author": "阿简",
        "body": "我做书签工具时也砍掉了自动分类。先把导入、去重和重新导出跑通之后，身边的人终于能拿自己的数据试用了。",
        "parent": "",
        "created": "2026-11-13T07:05:00Z",
        "sample": true
      },
      {
        "id": "sample-tool-scope-reply",
        "author": "小周",
        "body": "尤其喜欢先给真实用户试一轮这个步骤。空文件和重复导入的问题，都是朋友顺手点两下才发现的。",
        "parent": "sample-tool-scope",
        "created": "2026-11-13T09:25:00Z",
        "sample": true
      },
      {
        "id": "sample-tool-feedback",
        "author": "沈河",
        "body": "第一次发布只保留一个反馈问题，对我也挺有帮助。我会问：你在哪一步停下来，想知道接下来该干什么？",
        "parent": "",
        "created": "2026-11-14T11:42:00Z",
        "sample": true
      }
    ],
    "same-task-two-prompts": [
      {
        "id": "sample-prompt-compare",
        "author": "林栩",
        "body": "对比提示词时固定同一份输入很实用。我还加了一个检查项，看看哪份输出能直接按步骤复现。",
        "parent": "",
        "created": "2026-10-30T03:15:00Z",
        "sample": true
      }
    ]
  },
  "settings": {
    "title": "开发手记",
    "author": "itfetter",
    "description": "写个人项目从想法到做出来的过程，记录日常使用 AI 的体验，也留下一些开发时踩过的坑。",
    "about": "这里会写自己动手做的小项目、日常和 AI 一起工作的体验，以及后来想翻回来看一眼的技术笔记。项目是怎么开始的、工具在哪一步帮了忙、做完后想改哪里，都是值得记下的内容。",
    "github": "https://github.com/itfetter",
    "featured": "working-with-coding-agents"
  }
};
