(() => {
  const page = document.querySelector('#admin-page');
  const feedback = document.querySelector('#admin-status');
  const deletion = document.querySelector('#admin-delete');
  const {escape, blocks:parseMarkdown, source:markdownSource, render:renderMarkdown} = window.blogMarkdown;
  const labels = {posts:'文章',notes:'笔记',projects:'项目'};
  const types = {p:'正文',h1:'一级标题',h2:'二级标题',h3:'三级标题',h4:'四级标题',h5:'五级标题',h6:'六级标题',ul:'无序列表',ol:'有序列表',quote:'引用',code:'代码块'};
  const input = (name, label, value, limit, type = 'text', required = true) => `<label class="admin-field">${label}<input name="${name}" type="${type}" value="${escape(value || '')}" maxlength="${limit}"${required ? ' required' : ''}></label>`;
  const textarea = (name, label, value, limit, required = true) => `<label class="admin-field">${label}<textarea name="${name}" maxlength="${limit}"${required ? ' required' : ''}>${escape(value || '')}</textarea></label>`;
  const select = (name, label, options, selected) => `<label class="admin-field">${label}<select name="${name}">${options.map(([value,text]) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
  let data;
  let view = 'overview';
  let dirty = false;
  let busy = false;

  function leaveEditor() {
    return !busy && (!dirty || window.confirm('改动尚未保存。确定离开编辑页？'));
  }

  async function api(change) {
    const response = await fetch('/admin/content', change === undefined ? {} : {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(change),
    });
    if (response.status === 401) {
      location.assign('/admin');
      throw new Error('登录已过期，请重新登录。');
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '操作失败，请重试。');
    return payload;
  }

  function notify(message, error = false) {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  }

  function switchView(next) {
    if (!leaveEditor()) return;
    view = next;
    dirty = false;
    notify('');
    render();
  }

  function download(name, text, mimeType) {
    const url = URL.createObjectURL(new Blob([text], {type:mimeType}));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function render() {
    document.querySelectorAll('[data-view]').forEach(button => {
      if (button.dataset.view === view) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    if (view === 'settings') {
      settingsForm();
    } else if (view === 'overview') {
      page.innerHTML = `<div class="admin-page-head"><div><h2>总览</h2><p>查看博客的发布状态，继续整理内容。</p></div><button type="button" class="primary" id="quick-post">新建文章</button></div>
        <div class="admin-metrics">${Object.entries(labels).map(([key,label]) => `<button type="button" class="admin-metric" data-open="${key}"><strong>${data[key].filter(item => item.status === 'published').length}</strong><span>已发布${label}</span><small>${data[key].filter(item => item.status === 'draft').length} 条草稿</small></button>`).join('')}</div>
        <section class="admin-card"><h3>站点</h3><p>${escape(data.settings.author)} · ${escape(data.settings.title)}</p><button type="button" class="secondary" data-open="settings">编辑站点设置</button></section>`;
      page.querySelector('#quick-post').addEventListener('click', () => {
        switchView('posts');
        openEditor();
      });
      page.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.open)));
    } else {
      contentList();
    }
  }

  function contentList() {
    const label = labels[view];
    page.innerHTML = `<div class="admin-page-head"><div><h2>${label}</h2><p>管理已发布内容和草稿。</p></div><button type="button" class="primary" id="new-item">新建${label}</button></div>
      <div class="admin-list"><div class="admin-filters"><label><span>搜索${label}</span><input type="search" id="item-query" placeholder="按标题查找"></label>
      <label><span>发布状态</span><select id="item-status"><option value="">全部</option><option value="published">已发布</option><option value="draft">草稿</option></select></label><p class="subtle" id="item-count" role="status"></p></div><div id="item-rows"></div></div>`;
    const query = page.querySelector('#item-query');
    const state = page.querySelector('#item-status');
    const rows = page.querySelector('#item-rows');
    function refresh() {
      const visible = data[view].filter(item => (!state.value || item.status === state.value) && item.title.toLowerCase().includes(query.value.trim().toLowerCase()));
      page.querySelector('#item-count').textContent = `共 ${visible.length} 条`;
      rows.innerHTML = visible.length ? `<ul>${[...visible].sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(item => `<li><div><button type="button" class="admin-item-title" data-edit="${item.id}">${escape(item.title)}</button><small>${escape(item.date || item.kind || '')}${item.topic ? ` · ${escape(data.topics[item.topic])}` : ''}</small></div><span class="admin-state ${item.status}">${item.status === 'published' ? '已发布' : '草稿'}</span><div class="admin-row-actions">${view === 'posts' && item.status === 'published' ? `<a href="/#post/${item.id}" target="_blank" rel="noopener">查看</a>` : ''}<button type="button" data-delete="${item.id}" aria-label="删除 ${escape(item.title)}">删除</button></div></li>`).join('')}</ul>` : `<div class="admin-empty"><p>${query.value || state.value ? '没有符合条件的内容。' : `还没有${label}。`}</p>${query.value || state.value ? '<button type="button" class="secondary" id="reset-items">清除筛选</button>' : ''}</div>`;
    }
    query.addEventListener('input',refresh);
    state.addEventListener('change',refresh);
    page.querySelector('#new-item').addEventListener('click', () => openEditor());
    rows.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.id === 'reset-items') {
        query.value = '';
        state.value = '';
        query.focus();
        refresh();
      } else if (button.dataset.edit) openEditor(data[view].find(item => item.id === button.dataset.edit));
      else if (button.dataset.delete) {
        const item = data[view].find(item => item.id === button.dataset.delete);
        deletion.querySelector('p').textContent = `「${item.title}」将从后台和前台移除。`;
        deletion.returnValue = 'cancel';
        deletion.showModal();
        deletion.addEventListener('close', () => {
          if (deletion.returnValue === 'delete') save({collection:view,id:item.id,item:null}, '已删除。');
        }, {once:true});
      }
    });
    refresh();
  }

  async function save(change, message, form) {
    if (busy) return;
    busy = true;
    if (form) form.querySelector('button[type=submit]').disabled = true;
    notify('正在保存…');
    try {
      data = await api(change);
      dirty = false;
      render();
      notify(message);
    } catch (error) {
      notify(error.message, true);
    } finally {
      busy = false;
      if (form) form.querySelector('button[type=submit]').disabled = false;
    }
  }

  function trackForm(form) {
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });
  }

  function openEditor(item = {}) {
    const collection = view;
    const isPost = collection === 'posts';
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const status = select('status','发布状态', [['draft','草稿'],['published','已发布']], item.status || 'draft');
    const date = input('date','发布日期',item.date || localDate,10,'date');
    const kind = input('kind','分类或状态说明',item.kind,40);
    const articleOptions = [['','无关联'],...data.posts.map(post => [post.id,post.title])];
    const fields = isPost ? `${select('topic','文章主题',Object.entries(data.topics),item.topic || Object.keys(data.topics)[0])}${date}${status}` : `${kind}${collection === 'notes' ? date : select('post','关联文章',articleOptions,item.post || '')}${status}`;
    const details = isPost ? `${textarea('summary','文章摘要',item.summary,350,false)}<section id="article-editor"></section>` : `${textarea('text','简短说明',item.text,350)}${collection === 'notes' ? textarea('detail','笔记正文',item.detail,8000,false) : input('url','项目链接',item.url,300,'url',false)}`;
    page.innerHTML = `<div class="admin-page-head"><div><button type="button" class="admin-back" id="return-list">返回${labels[collection]}列表</button><h2>${item.id ? '编辑' : '新建'}${labels[collection]}</h2></div></div>
      <form id="content-form" class="admin-editor"><div class="admin-card editor-meta">${input('title','标题',item.title,150)}<div class="admin-fields">${fields}</div>${details}</div><div class="admin-save"><p class="subtle">草稿仅在后台可见。保存为已发布后会显示在博客。</p><button type="submit" class="primary">保存${labels[collection]}</button></div></form>`;
    const form = page.querySelector('form');
    const editor = isPost ? articleEditor(form.querySelector('#article-editor'), item) : null;
    trackForm(form);
    page.querySelector('#return-list').addEventListener('click', () => switchView(collection));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      if (editor) fields.body = editor();
      save({collection,id:item.id || '',item:fields}, fields.status === 'published' ? '已保存并更新前台。' : '草稿已保存。', form);
    });
    form.querySelector('[name=title]').focus();
  }

  function settingsForm() {
    const {settings} = data;
    const featured = [['','不置顶'],...data.posts.filter(post => post.status === 'published').map(post => [post.id,post.title])];
    page.innerHTML = `<div class="admin-page-head"><div><h2>站点设置</h2><p>保存后会更新前台首页、关于页和页脚。</p></div></div>
      <form class="admin-editor"><div class="admin-card"><div class="admin-fields">${input('title','博客名称',settings.title,70)}${input('author','作者名称',settings.author,50)}</div>${textarea('description','首页介绍',settings.description,350)}${textarea('about','关于页正文（Markdown）',settings.about,8000)}${input('github','GitHub 链接',settings.github,300,'url',false)}${select('featured','首页置顶文章',featured,settings.featured)}</div><div class="admin-save"><button type="submit" class="primary">保存设置</button></div></form>
      <section class="admin-card"><h3>静态站点导出</h3><p>导出已发布内容和站点设置，用于更新静态站点。草稿不会写入导出文件。</p><button type="button" class="secondary" id="export-site">导出公开 content.js</button></section>`;
    const form = page.querySelector('form');
    trackForm(form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      save({collection:'settings',item:Object.fromEntries(new FormData(form))}, '站点设置已保存。', form);
    });
    page.querySelector('#export-site').addEventListener('click', async () => {
      try {
        const response = await fetch('/content.js');
        if (!response.ok) throw new Error('公开内容导出失败。');
        download('content.js',await response.text(),'text/javascript;charset=utf-8');
      } catch (error) { notify(error.message,true); }
    });
  }

  function articleEditor(root, item) {
    let markdown = item.body || '';
    let blocks = parseMarkdown(markdown);
    if (!blocks.length) blocks.push({type:'p',text:''});
    let mode = 'blocks';
    let legacy = '';
    if (!item.id) {
      try { legacy = localStorage.getItem('itfetter-draft') || ''; } catch {}
    }
    root.innerHTML = `<div class="editor-toolbar"><div class="editor-modes" role="group" aria-label="正文编辑模式"><button type="button" data-mode="blocks">块编辑</button><button type="button" data-mode="source">Markdown</button><button type="button" data-mode="preview">预览</button></div><button type="button" class="secondary" data-export>导出 .md</button></div>
      ${legacy ? '<button type="button" class="secondary" data-restore>带入原浏览器草稿</button>' : ''}<div id="article-canvas"></div>`;
    const canvas = root.querySelector('#article-canvas');
    const typeButtons = Object.entries(types).map(([type,label]) => `<button type="button" data-type="${type}">${label}</button>`).join('');
    const exportButton = root.querySelector('[data-export]');

    function updateMarkdown() {
      markdown = markdownSource(blocks);
      exportButton.disabled = !markdown.trim();
      dirty = true;
    }

    function focusBlock(index) {
      canvas.querySelector(`[data-block="${index}"] textarea`)?.focus();
    }

    function paint() {
      root.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode === mode)));
      exportButton.disabled = !markdown.trim();
      if (mode === 'source') {
        canvas.innerHTML = `<label class="admin-field editor-source">Markdown 正文<textarea maxlength="180000">${escape(markdown)}</textarea></label>`;
      } else if (mode === 'preview') {
        canvas.innerHTML = `<div class="editor-preview">${renderMarkdown(parseMarkdown(markdown)) || '<p class="subtle">还没有正文。返回块编辑或 Markdown 开始写作。</p>'}</div>`;
      } else {
        canvas.innerHTML = `<p class="subtle editor-hint">点段落旁的按钮更换类型。在空白块输入 / 也能打开菜单。</p>${blocks.map((block,index) => `<div class="document-block block-${block.type}" data-block="${index}"><details class="block-menu"><summary aria-label="${types[block.type]}，第 ${index + 1} 块">⋮⋮</summary><div class="block-options"><p>块类型</p>${typeButtons}<p>块操作</p><button type="button" data-action="add">在下方添加</button><button type="button" data-action="up"${index === 0 ? ' disabled' : ''}>上移</button><button type="button" data-action="down"${index === blocks.length-1 ? ' disabled' : ''}>下移</button><button type="button" data-action="remove">删除此块</button></div></details><textarea rows="1" aria-label="${types[block.type]} ${index + 1}" placeholder="${block.type === 'p' ? '输入正文，或按 / 选择块类型' : types[block.type]}">${escape(block.text)}</textarea></div>`).join('')}<button type="button" class="secondary add-block" data-action="append">＋ 添加段落</button>`;
      }
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.mode) {
        if (button.dataset.mode === 'blocks' && mode !== 'blocks') {
          blocks = parseMarkdown(markdown);
          if (!blocks.length) blocks.push({type:'p',text:''});
        }
        mode = button.dataset.mode;
        paint();
      } else if ('restore' in button.dataset) {
        if (markdown.trim() && !window.confirm('用原浏览器草稿替换当前正文？')) return;
        markdown = legacy;
        blocks = parseMarkdown(markdown);
        if (!blocks.length) blocks.push({type:'p',text:''});
        dirty = true;
        paint();
      } else if ('export' in button.dataset) {
        download(`${item.id || 'itfetter-draft'}.md`,markdown,'text/markdown;charset=utf-8');
      } else if (button.dataset.type || button.dataset.action) {
        const row = button.closest('[data-block]');
        let index = row ? Number(row.dataset.block) : blocks.length-1;
        const action = button.dataset.action;
        if (button.dataset.type) blocks[index].type = button.dataset.type;
        if (action === 'add' || action === 'append') blocks.splice(++index,0,{type:'p',text:''});
        if (action === 'up' || action === 'down') {
          const target = index + (action === 'up' ? -1 : 1);
          [blocks[index],blocks[target]] = [blocks[target],blocks[index]];
          index = target;
        }
        if (action === 'remove') {
          if (blocks[index].text.trim() && !window.confirm('删除这个正文块？')) return;
          blocks.splice(index,1);
          if (!blocks.length) blocks.push({type:'p',text:''});
          index = Math.min(index, blocks.length-1);
        }
        updateMarkdown();
        paint();
        focusBlock(index);
      }
    });

    canvas.addEventListener('input', event => {
      if (mode === 'source') {
        markdown = event.target.value;
        exportButton.disabled = !markdown.trim();
        dirty = true;
      } else if (mode === 'blocks' && event.target.matches('textarea')) {
        const index = Number(event.target.closest('[data-block]').dataset.block);
        blocks[index].text = event.target.value;
        updateMarkdown();
      }
    });

    canvas.addEventListener('keydown', event => {
      if (event.isComposing) return;
      const row = event.target.closest('[data-block]');
      if (event.key === '/' && row && event.target.matches('textarea') && !event.target.value) {
        event.preventDefault();
        const menu = row.querySelector('details');
        menu.open = true;
        menu.querySelector('button').focus();
      } else if (event.key === 'Enter' && !event.shiftKey && row && event.target.matches('textarea')) {
        const index = Number(row.dataset.block);
        const block = blocks[index];
        if (block.type !== 'p' && !/^h[1-6]$/.test(block.type)) return;
        event.preventDefault();
        const tail = block.text.slice(event.target.selectionEnd);
        block.text = block.text.slice(0,event.target.selectionStart);
        blocks.splice(index+1,0,{type:'p',text:tail});
        updateMarkdown();
        paint();
        focusBlock(index+1);
        const next = canvas.querySelector(`[data-block="${index+1}"] textarea`);
        next.setSelectionRange(0,0);
      } else if (event.key === 'Escape') {
        const menu = event.target.closest('details[open]');
        if (menu) {
          menu.open = false;
          menu.closest('[data-block]').querySelector('textarea').focus();
        }
      }
    });
    paint();
    return () => markdown;
  }

  document.querySelectorAll('.admin-nav button').forEach(button => button.addEventListener('click', () => {
    if (data) switchView(button.dataset.view);
  }));
  document.addEventListener('keydown', event => {
    const form = event.target.closest('.admin-editor');
    if (form && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (dirty) event.preventDefault();
  });
  api().then(content => {
    data = content;
    render();
  }).catch(error => {
    page.innerHTML = '<h2>未能加载内容</h2><p><a class="secondary" href="/admin">重新加载</a></p>';
    notify(error.message,true);
  });
})();
