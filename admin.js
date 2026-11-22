(() => {
  const page = document.querySelector('#admin-page');
  const feedback = document.querySelector('#admin-status');
  const deletion = document.querySelector('#admin-delete');
  const {escape, blocks:parseMarkdown, source:markdownSource, render:renderMarkdown, fromDocument:readDocument, clipboardBlocks} = window.blogMarkdown;
  const labels = {posts:'文章',notes:'笔记',projects:'项目'};
  const types = {p:'正文',h1:'一级标题',h2:'二级标题',h3:'三级标题',h4:'四级标题',h5:'五级标题',h6:'六级标题',ul:'无序列表',ol:'有序列表',quote:'引用',code:'代码块'};
  const input = (name, label, value, limit, type = 'text', required = true) => `<label class="admin-field">${label}<input name="${name}" type="${type}" value="${escape(value || '')}" maxlength="${limit}"${required ? ' required' : ''}></label>`;
  const textarea = (name, label, value, limit, required = true) => `<label class="admin-field">${label}<textarea name="${name}" maxlength="${limit}"${required ? ' required' : ''}>${escape(value || '')}</textarea></label>`;
  const select = (name, label, options, selected) => `<label class="admin-field">${label}<select name="${name}">${options.map(([value,text]) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
  let data;
  const requestedView = location.hash.slice(1);
  let view = Object.hasOwn(labels,requestedView) || requestedView === 'settings' ? requestedView : 'overview';
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
    const fragment = next === 'overview' ? '' : `#${next}`;
    history.replaceState(history.state,'',`${location.pathname}${location.search}${fragment}`);
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
        <div class="admin-metrics">${Object.entries(labels).map(([key,label]) => `<button type="button" class="admin-metric" data-open="${key}"><strong>${data[key].filter(item => item.status === 'published').length}</strong><span>已发布${label}</span><small>${data[key].filter(item => item.status === 'draft' || item.draft).length} 条草稿</small></button>`).join('')}</div>
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
      <label><span>发布状态</span><select id="item-status"><option value="">全部</option><option value="published">已发布</option><option value="draft">草稿</option>${view === 'posts' ? '<option value="revision">有草稿</option>' : ''}</select></label><p class="subtle" id="item-count" role="status"></p></div><div id="item-rows"></div></div>`;
    const query = page.querySelector('#item-query');
    const state = page.querySelector('#item-status');
    const rows = page.querySelector('#item-rows');
    function refresh() {
      const keyword = query.value.trim().toLowerCase();
      const visible = data[view].filter(item => (!state.value || item.status === state.value || (state.value === 'revision' && item.draft)) && [item.title,item.draft?.title].some(title => title?.toLowerCase().includes(keyword)));
      page.querySelector('#item-count').textContent = `共 ${visible.length} 条`;
      rows.innerHTML = visible.length ? `<ul>${[...visible].sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(item => `<li><div><strong class="admin-item-title">${escape(item.title)}</strong><small>${escape(item.date || item.kind || '')}${item.topic ? ` · ${escape(data.topics[item.topic])}` : ''}</small></div><div class="admin-states"><span class="admin-state ${item.status}">${item.status === 'published' ? '已发布' : '草稿'}</span>${item.draft ? '<span class="admin-state">有草稿</span>' : ''}</div><div class="admin-row-actions"><button type="button" data-edit="${item.id}" aria-label="编辑 ${escape(item.title)}">编辑</button>${view === 'posts' && item.status === 'published' ? `<a href="/#post/${item.id}" target="_blank" rel="noopener">查看</a>` : ''}<button type="button" data-delete="${item.id}" aria-label="删除 ${escape(item.title)}">删除</button></div></li>`).join('')}</ul>` : `<div class="admin-empty"><p>${query.value || state.value ? '没有符合条件的内容。' : `还没有${label}。`}</p>${query.value || state.value ? '<button type="button" class="secondary" id="reset-items">清除筛选</button>' : ''}</div>`;
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
    const buttons = form ? [...form.querySelectorAll('button[type=submit],#withdraw-post')] : [];
    buttons.forEach(button => { button.disabled = true; });
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
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function trackForm(form) {
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });
  }

  function openEditor(entry = {}) {
    const collection = view;
    const isPost = collection === 'posts';
    const item = entry.draft || entry;
    const published = isPost && entry.status === 'published';
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const status = select('status','发布状态', [['draft','草稿'],['published','已发布']], item.status || 'draft');
    const date = input('date','发布日期',item.date || localDate,10,'date');
    const kind = input('kind','分类或状态说明',item.kind,40);
    const articleOptions = [['','无关联'],...data.posts.map(post => [post.id,post.title])];
    const fields = isPost ? `${select('topic','文章主题',Object.entries(data.topics),item.topic || Object.keys(data.topics)[0])}${date}` : `${kind}${collection === 'notes' ? date : select('post','关联文章',articleOptions,item.post || '')}${status}`;
    const details = `${textarea('text','简短说明',item.text,350)}${collection === 'notes' ? textarea('detail','笔记正文',item.detail,8000,false) : input('url','项目链接',item.url,300,'url',false)}`;
    const editorFields = isPost ? `<div class="document-header">${input('title','文章标题',item.title,150)}<details class="publication-settings"><summary>发布设置</summary><div class="admin-fields">${fields}</div>${textarea('summary','文章摘要',item.summary,350,false)}</details></div><section id="article-editor"></section>` : `${input('title','标题',item.title,150)}<div class="admin-fields">${fields}</div>${details}`;
    const actions = isPost ? `<p class="subtle">${published ? '保存草稿后，读者仍看到已发布版本。' : '发布后，文章会出现在博客上。'}</p><button type="submit" class="secondary" name="status" value="draft">保存草稿</button><button type="submit" class="primary" name="status" value="published">${published ? '发布更新' : '发布文章'}</button>` : `<button type="submit" class="primary">保存${labels[collection]}</button>`;
    page.innerHTML = `<div class="admin-page-head"><div><button type="button" class="admin-back" id="return-list">返回${labels[collection]}列表</button><h2>${item.id ? '编辑' : '新建'}${labels[collection]}</h2></div>${published ? '<button type="button" class="secondary" id="withdraw-post">撤回发布</button>' : ''}</div>
      <form id="content-form" class="admin-editor"><div class="admin-card ${isPost ? 'document-card' : ''}">${editorFields}</div><div class="admin-save">${actions}</div></form>`;
    const form = page.querySelector('form');
    const editor = isPost ? articleEditor(form.querySelector('#article-editor'), item) : null;
    trackForm(form);
    form.addEventListener('invalid', event => {
      const settings = event.target.closest('.publication-settings');
      if (settings) settings.open = true;
    },true);
    page.querySelector('#return-list').addEventListener('click', () => switchView(collection));
    page.querySelector('#withdraw-post')?.addEventListener('click', () => {
      if (leaveEditor() && window.confirm('撤回后读者将暂时无法访问这篇文章。确定撤回？')) {
        save({collection,id:entry.id,action:'withdraw'},'已撤回发布，文章保留为草稿。');
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      if (editor) {
        fields.body = editor();
        fields.status = event.submitter?.value || 'draft';
      }
      save({collection,id:entry.id || '',item:fields}, fields.status === 'published' ? '已发布到博客。' : '草稿已保存。', form);
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
    let mode = 'document';
    let activeRange = null;
    const undoStack = [];
    const redoStack = [];
    let savedDocument = null;
    let beforeInput = null;
    let composing = false;
    let applyingEdit = false;
    let legacy = '';
    if (!item.id) {
      try { legacy = localStorage.getItem('itfetter-draft') || ''; } catch {}
    }
    root.innerHTML = `<div class="editor-toolbar"><div class="editor-modes" role="group" aria-label="正文编辑模式"><button type="button" data-mode="document">文档编辑</button><button type="button" data-mode="source">Markdown</button><button type="button" data-mode="preview">预览</button></div><button type="button" class="secondary" data-export>导出 .md</button></div>
      ${legacy ? '<button type="button" class="secondary" data-restore>带入原浏览器草稿</button>' : ''}<div id="article-canvas"></div>`;
    const canvas = root.querySelector('#article-canvas');
    const exportButton = root.querySelector('[data-export]');
    const typeButtons = Object.entries(types).filter(([type]) => !/^h[4-6]$/.test(type)).map(([type,label]) => `<button type="button" data-type="${type}">${label}</button>`).join('');
    let documentEditor = null;
    let menu = null;
    let menuBlock = null;
    let hoverOpened = false;

    function blockAt(node) {
      if (node?.nodeType === 3) node = node.parentElement;
      if (!node || node === documentEditor || !documentEditor?.contains(node)) return null;
      const block = node.closest('li,pre,blockquote,h1,h2,h3,h4,h5,h6,p,div');
      return block === documentEditor ? null : block;
    }

    function positionMenu(block) {
      if (menuBlock !== block) menuBlock?.classList.remove('block-menu-target');
      menuBlock = block;
      menu.hidden = !block;
      if (!block) return;
      menu.style.top = `${block.getBoundingClientRect().top - documentEditor.getBoundingClientRect().top}px`;
      const type = ({li:block.parentElement.localName,pre:'code',blockquote:'quote'})[block.localName] || block.localName;
      const glyph = ({p:'¶',div:'¶',ul:'•',ol:'1.',code:'‹›',quote:'“'})[type] || type.toUpperCase();
      menu.querySelector('.block-type').textContent = glyph;
      menu.querySelector('summary').setAttribute('aria-label',`当前块操作，${types[type] || '正文'}`);
      menu.querySelector('[data-action=up]').disabled = !block.previousElementSibling;
      menu.querySelector('[data-action=down]').disabled = !block.nextElementSibling;
      menu.querySelector('[data-action=remove]').disabled = false;
    }

    function trackSelection(showHandle = true) {
      const selection = window.getSelection();
      if (!selection.rangeCount || !documentEditor?.contains(selection.anchorNode) || !documentEditor.contains(selection.focusNode)) return;
      activeRange = selection.getRangeAt(0).cloneRange();
      if (showHandle && !menu.open) {
        const block = blockAt(activeRange.startContainer) || documentEditor.firstElementChild;
        positionMenu(block);
      }
    }

    function sync() {
      markdown = markdownSource(readDocument(documentEditor));
      exportButton.disabled = !markdown.trim();
      dirty = true;
    }

    function selectRange(range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function placeCursor(node, atStart = true) {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(atStart);
      documentEditor.focus();
      selectRange(range);
      trackSelection();
    }

    function snapshot() {
      trackSelection(false);
      const content = documentEditor.cloneNode(true);
      content.querySelectorAll('.block-menu-target,[class=""]').forEach(node => {
        node.classList.remove('block-menu-target');
        if (!node.className) node.removeAttribute('class');
      });
      const point = (node, offset) => {
        if (!documentEditor.contains(node)) return null;
        const path = [];
        for (; node !== documentEditor; node = node.parentNode) {
          path.unshift([...node.parentNode.childNodes].indexOf(node));
        }
        return {path,offset};
      };
      return {html:content.innerHTML,markdown,start:point(activeRange?.startContainer,activeRange?.startOffset),end:point(activeRange?.endContainer,activeRange?.endOffset)};
    }

    function record(previous, current = snapshot()) {
      if (!previous) return;
      if (previous.html === current.html && previous.markdown === current.markdown) return;
      undoStack.push(previous);
      if (undoStack.length > 60) undoStack.shift();
      redoStack.length = 0;
    }

    function applyEdit(edit) {
      const previous = snapshot();
      applyingEdit = true;
      try { edit(); } finally { applyingEdit = false; }
      const current = snapshot();
      if (previous.html === current.html) return;
      sync();
      trackSelection();
      current.markdown = markdown;
      record(previous,current);
    }

    function restoreSnapshot(state) {
      hoverOpened = false;
      menu.open = false;
      positionMenu(null);
      documentEditor.innerHTML = state.html;
      activeRange = null;
      documentEditor.focus();
      const endpoint = point => point?.path.reduce((node,index) => node?.childNodes[index],documentEditor);
      const start = endpoint(state.start);
      const end = endpoint(state.end);
      if (start && end) {
        const range = document.createRange();
        const limit = node => node.nodeType === 3 ? node.length : node.childNodes.length;
        range.setStart(start,Math.min(state.start.offset,limit(start)));
        range.setEnd(end,Math.min(state.end.offset,limit(end)));
        selectRange(range);
      } else {
        placeCursor(documentEditor.lastElementChild || documentEditor,false);
      }
      markdown = state.markdown;
      exportButton.disabled = !markdown.trim();
      dirty = true;
      trackSelection();
    }

    function stepHistory(isUndo) {
      const from = isUndo ? undoStack : redoStack;
      const to = isUndo ? redoStack : undoStack;
      const state = from.pop();
      if (!state) return;
      to.push(snapshot());
      restoreSnapshot(state);
    }

    function paint() {
      root.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode === mode)));
      exportButton.disabled = !markdown.trim();
      documentEditor = null;
      menuBlock = null;
      hoverOpened = false;
      activeRange = null;
      beforeInput = null;
      composing = false;
      if (mode === 'source') {
        canvas.innerHTML = `<label class="admin-field editor-source">Markdown 正文<textarea maxlength="180000">${escape(markdown)}</textarea></label>`;
      } else if (mode === 'preview') {
        canvas.innerHTML = `<div class="editor-preview">${renderMarkdown(parseMarkdown(markdown)) || '<p class="subtle">还没有正文。</p>'}</div>`;
      } else {
        canvas.innerHTML = `<div class="document-workspace"><details class="block-menu" hidden><summary aria-label="当前块操作"><span class="block-type" aria-hidden="true">¶</span><span aria-hidden="true">⋮⋮</span></summary><div class="block-options"><p>块类型</p>${typeButtons}<p>格式</p><button type="button" data-command="bold">加粗</button><p>块操作</p><button type="button" data-action="add">在下方添加</button><button type="button" data-action="up" disabled>上移</button><button type="button" data-action="down" disabled>下移</button><button type="button" data-action="remove" disabled>删除此块</button></div></details><div class="document-editor" contenteditable="true" role="textbox" aria-label="文章正文" aria-multiline="true" spellcheck="false">${renderMarkdown(parseMarkdown(markdown)) || '<p><br></p>'}</div></div><p class="subtle editor-hint">指向正文块可打开左侧菜单，空白块也可以按 /。</p>`;
        documentEditor = canvas.querySelector('.document-editor');
        menu = canvas.querySelector('.block-menu');
        menu.addEventListener('toggle', event => {
          if (event.currentTarget === menu) menuBlock?.classList.toggle('block-menu-target',menu.open);
        });
        if (savedDocument?.markdown === markdown) documentEditor.innerHTML = savedDocument.html;
        else if (savedDocument) record(savedDocument);
        savedDocument = null;
      }
    }

    function changeBlock(button) {
      const block = menuBlock;
      hoverOpened = false;
      menu.open = false;
      if (!block) return;
      const range = activeRange?.cloneRange() || document.createRange();
      if (!block.contains(range.startContainer) || (!button.dataset.command && !block.contains(range.endContainer))) {
        range.selectNodeContents(block);
        range.collapse(true);
      }
      documentEditor.focus();
      selectRange(range);
      const action = button.dataset.action;
      if (action === 'add' && block) {
        const after = block.localName === 'li' ? block.parentElement : block;
        const paragraph = document.createElement('p');
        paragraph.append(document.createElement('br'));
        after.after(paragraph);
        placeCursor(paragraph);
        return;
      }
      if (action === 'up' || action === 'down') {
        if (action === 'up') block.previousElementSibling.before(block);
        else block.nextElementSibling.after(block);
        placeCursor(block);
        return;
      }
      if (action === 'remove') {
        if (block.textContent.trim() && !window.confirm('删除这个正文块？')) return;
        const neighbor = block.nextElementSibling || block.previousElementSibling;
        const parent = block.parentElement;
        block.remove();
        if (parent !== documentEditor && !parent.children.length) parent.remove();
        if (!documentEditor.children.length) documentEditor.innerHTML = '<p><br></p>';
        placeCursor(neighbor || documentEditor.firstElementChild);
        return;
      }

      const type = button.dataset.type;
      if (type === 'code' && block.localName !== 'pre') {
        const code = document.createElement('code');
        code.textContent = block.innerText;
        const pre = document.createElement('pre');
        pre.append(code);
        const prefix = document.createRange();
        prefix.selectNodeContents(block);
        prefix.setEnd(range.startContainer,range.startOffset);
        const start = prefix.toString().length;
        prefix.setEnd(range.endContainer,range.endOffset);
        const end = prefix.toString().length;
        if (block.localName === 'li') {
          const list = block.parentElement;
          const rest = list.cloneNode(false);
          if (list.localName === 'ol') rest.start = list.start + [...list.children].indexOf(block) + 1;
          while (block.nextElementSibling) rest.append(block.nextElementSibling);
          list.after(pre);
          if (rest.children.length) pre.after(rest);
          block.remove();
          if (!list.children.length) list.remove();
        } else block.replaceWith(pre);
        if (code.firstChild) {
          range.setStart(code.firstChild,Math.min(start,code.textContent.length));
          range.setEnd(code.firstChild,Math.min(end,code.textContent.length));
          selectRange(range);
        } else {
          pre.append(document.createElement('br'));
          placeCursor(pre);
        }
      } else if (type === 'ul' || type === 'ol') document.execCommand(type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
      else if (type) document.execCommand('formatBlock',false,({quote:'blockquote',code:'pre'})[type] || type);
      else if (button.dataset.command) document.execCommand(button.dataset.command);
      trackSelection();
    }

    root.addEventListener('click', event => {
      if (hoverOpened && menu?.contains(event.target) && event.target.closest('summary')) {
        event.preventDefault();
        hoverOpened = false;
        return;
      }
      const button = event.target.closest('button');
      if (!button) {
        if (documentEditor?.contains(event.target)) {
          hoverOpened = false;
          menu.open = false;
          trackSelection();
        }
        return;
      }
      if (button.dataset.mode) {
        if (mode === button.dataset.mode) return;
        if (documentEditor) savedDocument = snapshot();
        mode = button.dataset.mode;
        paint();
      } else if ('restore' in button.dataset) {
        if (markdown.trim() && !window.confirm('用原浏览器草稿替换当前正文？')) return;
        if (documentEditor) savedDocument = snapshot();
        markdown = legacy;
        dirty = true;
        paint();
      } else if ('export' in button.dataset) {
        download(`${item.id || 'itfetter-draft'}.md`,markdown,'text/markdown;charset=utf-8');
      } else if (menu?.contains(button)) {
        applyEdit(() => changeBlock(button));
      }
    });

    canvas.addEventListener('beforeinput', event => {
      if (applyingEdit || !documentEditor?.contains(event.target)) return;
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        stepHistory(event.inputType === 'historyUndo');
      } else if (!composing) beforeInput = snapshot();
    });
    canvas.addEventListener('compositionstart', event => {
      if (!documentEditor?.contains(event.target)) return;
      beforeInput = snapshot();
      composing = true;
    });
    canvas.addEventListener('compositionend', () => {
      if (!composing) return;
      composing = false;
      sync();
      record(beforeInput);
      beforeInput = null;
    });
    canvas.addEventListener('input', event => {
      if (mode === 'source') {
        markdown = event.target.value;
        exportButton.disabled = !markdown.trim();
        dirty = true;
      } else if (!applyingEdit && !composing && documentEditor?.contains(event.target)) {
        sync();
        trackSelection();
        record(beforeInput);
        beforeInput = null;
      }
    });

    canvas.addEventListener('paste', event => {
      if (!documentEditor?.contains(event.target)) return;
      const text = event.clipboardData.getData('text/plain');
      const html = event.clipboardData.getData('text/html');
      if (!text && !html) return;
      event.preventDefault();
      applyEdit(() => {
        const current = blockAt(activeRange?.startContainer);
        if (current?.closest('pre')) {
          if (text) document.execCommand('insertText',false,text);
          return;
        }
        const blocks = clipboardBlocks(html,text);
        if (blocks.length === 1 && blocks[0].type === 'p') {
          document.execCommand('insertHTML',false,renderMarkdown(blocks).slice(3,-4));
        } else if (blocks.length && activeRange) {
          // Rebuild the selected span from document blocks so a paste into a heading cannot nest the pasted paragraphs inside it.
          const beforeRange = document.createRange();
          beforeRange.selectNodeContents(documentEditor);
          beforeRange.setEnd(activeRange.startContainer,activeRange.startOffset);
          const afterRange = document.createRange();
          afterRange.selectNodeContents(documentEditor);
          afterRange.setStart(activeRange.endContainer,activeRange.endOffset);
          const before = readDocument(beforeRange.cloneContents());
          const after = readDocument(afterRange.cloneContents());
          documentEditor.innerHTML = renderMarkdown([...before,...blocks,...after]);
          placeCursor(documentEditor.children[before.length + blocks.length - 1],false);
        }
      });
    });

    canvas.addEventListener('pointermove', event => {
      if (!menu || menu.open || event.pointerType === 'touch') return;
      const block = blockAt(event.target);
      if (block && block !== menuBlock) positionMenu(block);
    });
    canvas.addEventListener('pointerover', event => {
      if (event.pointerType === 'touch' || !menuBlock || menu.open || !menu.contains(event.target) || !event.target.closest('summary')) return;
      trackSelection(false);
      menu.open = true;
      hoverOpened = true;
    });
    canvas.addEventListener('pointerout', event => {
      if (hoverOpened && menu.contains(event.target) && !menu.contains(event.relatedTarget)) {
        hoverOpened = false;
        menu.open = false;
      }
      if (!documentEditor || !menu || menu.open || !documentEditor.parentElement.contains(event.target)) return;
      if (!documentEditor.parentElement.contains(event.relatedTarget)) {
        positionMenu(document.activeElement === documentEditor ? blockAt(activeRange?.startContainer) : null);
      }
    });
    canvas.addEventListener('mousedown', event => {
      if (menu?.contains(event.target) && event.button === 0) {
        trackSelection(false);
        // Keep the browser's text selection while the pointer operates the block menu.
        event.preventDefault();
      }
    });
    for (const eventType of ['focusin','keyup','pointerup']) {
      canvas.addEventListener(eventType, event => {
        if (documentEditor?.contains(event.target)) trackSelection();
      });
    }
    root.addEventListener('keydown', event => {
      if (event.isComposing || !documentEditor) return;
      const key = event.key.toLowerCase();
      const undo = key === 'z' && !event.shiftKey;
      const redo = key === 'y' || (key === 'z' && event.shiftKey);
      if ((event.ctrlKey || event.metaKey) && (undo || redo)) {
        event.preventDefault();
        stepHistory(undo);
      } else if (event.key === '/' && documentEditor.contains(event.target)) {
        trackSelection();
        const block = blockAt(activeRange?.startContainer);
        if (activeRange?.collapsed && !(block || documentEditor).textContent.trim()) {
          event.preventDefault();
          menu.open = true;
          menu.querySelector('button').focus();
        }
      } else if (event.key === 'Escape' && menu.open && activeRange) {
        hoverOpened = false;
        menu.open = false;
        documentEditor.focus();
        selectRange(activeRange);
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
      form.requestSubmit(form.querySelector('button[value=draft]') || undefined);
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
