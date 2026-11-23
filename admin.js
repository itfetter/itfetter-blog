(() => {
  const page = document.querySelector('#admin-page');
  const feedback = document.querySelector('#admin-status');
  const confirmation = document.querySelector('#admin-confirm');
  const {escape, blocks:parseMarkdown, source:markdownSource, render:renderMarkdown, fromDocument:readDocument, clipboardBlocks, coverImage} = window.blogMarkdown;
  const labels = {posts:'文章',notes:'笔记',projects:'项目'};
  const types = {p:'正文',h1:'一级标题',h2:'二级标题',h3:'三级标题',h4:'四级标题',h5:'五级标题',h6:'六级标题',ul:'无序列表',ol:'有序列表',quote:'引用',code:'代码块',table:'插入表格'};
  const blockMarks = {p:'T',div:'T',ul:'•≡',ol:'1≡',quote:'❝',code:'‹›',table:'▦'};
  const input = (name, label, value, limit, type = 'text', required = true) => `<label class="admin-field">${label}<input name="${name}" type="${type}" value="${escape(value || '')}" maxlength="${limit}"${required ? ' required' : ''}></label>`;
  const textarea = (name, label, value, limit, required = true) => `<label class="admin-field">${label}<textarea name="${name}" maxlength="${limit}"${required ? ' required' : ''}>${escape(value || '')}</textarea></label>`;
  const select = (name, label, options, selected) => `<label class="admin-field">${label}<select name="${name}">${options.map(([value,text]) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
  let data;
  const requestedView = location.hash.slice(1);
  let view = Object.hasOwn(labels,requestedView) || requestedView === 'settings' ? requestedView : 'overview';
  let dirty = false;
  let busy = false;
  let editorEvents;

  function confirmAction(title, detail, action, destructive = false) {
    confirmation.querySelector('h2').textContent = title;
    confirmation.querySelector('p').textContent = detail;
    const button = confirmation.querySelector('[value=confirm]');
    button.textContent = action;
    button.className = destructive ? 'danger-button' : 'primary';
    confirmation.returnValue = '';
    confirmation.showModal();
    return new Promise(resolve => {
      confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), {once:true});
    });
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

  async function switchView(next) {
    if (busy || (dirty && !await confirmAction('离开编辑页？','尚未保存的改动会丢失。','离开'))) return false;
    view = next;
    const fragment = next === 'overview' ? '' : `#${next}`;
    history.replaceState(history.state,'',`${location.pathname}${location.search}${fragment}`);
    dirty = false;
    notify('');
    render();
    return true;
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
    editorEvents?.abort();
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
      page.querySelector('#quick-post').addEventListener('click', async () => {
        if (await switchView('posts')) openEditor();
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
    function articleMetrics(id) {
      const engagement = data.engagement?.[id];
      return `<small class="admin-article-stats"><span>浏览 ${engagement?.views ?? 0}</span><span>评论 ${data.comments?.[id]?.length ?? 0}</span><span>点赞 ${engagement?.likes.length ?? 0}</span></small>`;
    }
    function refresh() {
      const keyword = query.value.trim().toLowerCase();
      const visible = data[view].filter(item => (!state.value || item.status === state.value || (state.value === 'revision' && item.draft)) && [item.title,item.draft?.title].some(title => title?.toLowerCase().includes(keyword)));
      page.querySelector('#item-count').textContent = `共 ${visible.length} 条`;
      rows.innerHTML = visible.length ? `<ul>${[...visible].sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(item => `<li><div><strong class="admin-item-title">${escape(item.title)}</strong><small>${escape(item.date || item.kind || '')}${item.topic ? ` · ${escape(data.topics[item.topic])}` : ''}</small>${view === 'posts' ? articleMetrics(item.id) : ''}</div><div class="admin-states"><span class="admin-state ${item.status}">${item.status === 'published' ? '已发布' : '草稿'}</span>${item.draft ? '<span class="admin-state">有草稿</span>' : ''}</div><div class="admin-row-actions"><button type="button" data-edit="${item.id}" aria-label="编辑 ${escape(item.title)}">编辑</button>${view === 'posts' && item.status === 'published' ? `<a href="/#post/${item.id}" target="_blank" rel="noopener">查看</a>` : ''}<button type="button" data-delete="${item.id}" aria-label="删除 ${escape(item.title)}">删除</button></div></li>`).join('')}</ul>` : `<div class="admin-empty"><p>${query.value || state.value ? '没有符合条件的内容。' : `还没有${label}。`}</p>${query.value || state.value ? '<button type="button" class="secondary" id="reset-items">清除筛选</button>' : ''}</div>`;
    }
    query.addEventListener('input',refresh);
    state.addEventListener('change',refresh);
    page.querySelector('#new-item').addEventListener('click', () => openEditor());
    rows.addEventListener('click', async event => {
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
        if (await confirmAction('删除这条内容？',`「${item.title}」将从后台和前台移除。`,'确认删除',true)) {
          save({collection:view,id:item.id,item:null}, '已删除。');
        }
      }
    });
    refresh();
  }

  async function save(change, message, form, automatic = false) {
    if (busy) return;
    busy = true;
    const keepEditing = form && change.collection === 'posts' && change.item?.status === 'draft';
    const wasDirty = dirty;
    if (keepEditing) dirty = false;
    const buttons = form ? [...form.querySelectorAll('button[type=submit],#withdraw-post')] : [];
    buttons.forEach(button => { button.disabled = true; });
    const draftStatus = keepEditing && form.querySelector('.draft-save-status');
    const report = (text, error = false) => {
      if (!draftStatus) return notify(text,error);
      draftStatus.textContent = text;
      draftStatus.dataset.error = String(error);
    };
    report(automatic ? '正在自动保存…' : '正在保存…');
    try {
      data = await api(change);
      if (keepEditing) {
        if (!change.id) {
          // The server appends new articles to the returned list.
          form.dataset.postId = data.posts.at(-1).id;
          page.querySelector('.admin-page-head h2').textContent = '编辑文章';
        }
      } else {
        dirty = false;
        render();
      }
      report(keepEditing && dirty ? '有未保存的更改…' : message);
    } catch (error) {
      if (keepEditing) dirty ||= wasDirty;
      report(automatic ? `自动保存失败。${error.message} 可点击「保存草稿」重试。` : error.message,true);
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function trackForm(form, onChange = () => { dirty = true; }) {
    form.addEventListener('input',onChange);
    form.addEventListener('change',onChange);
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
    const kind = input('kind',collection === 'notes' ? '笔记类别' : '项目进度',item.kind,40);
    const articleOptions = [['','无关联'],...data.posts.map(post => [post.id,post.title])];
    const fields = isPost ? `${select('topic','文章主题',Object.entries(data.topics),item.topic || Object.keys(data.topics)[0])}${date}` : `${kind}${collection === 'notes' ? date : select('post','关联文章',articleOptions,item.post || '')}${status}`;
    const details = `${textarea('text','简短说明',item.text,350)}${textarea('detail',collection === 'notes' ? '笔记正文（Markdown）' : '项目详情（Markdown）',item.detail,8000,false)}${collection === 'projects' ? input('url','项目链接',item.url,300,'url',false) : ''}`;
    const editorFields = isPost ? `<div class="document-header">${input('title','文章标题',item.title,150)}<p class="draft-save-status subtle" role="status">${item.status === 'draft' ? '草稿已保存。' : '编辑后自动保存草稿。'}</p><details class="publication-settings"><summary>发布设置</summary><div class="admin-fields">${fields}</div>${textarea('summary','文章摘要',item.summary,350,false)}<div class="admin-fields">${input('cover','封面图片地址',item.cover,500,'text',false)}${input('coverAlt','封面替代文字',item.coverAlt,150,'text',false)}</div></details></div><div class="editor-cover">${coverImage(item)}</div><section id="article-editor"></section>` : `${input('title','标题',item.title,150)}<div class="admin-fields">${fields}</div>${details}`;
    const actions = isPost ? `<p class="subtle">${published ? '保存草稿后，读者仍看到已发布版本。' : '发布后，文章会出现在博客上。'}</p><button type="submit" class="secondary" name="status" value="draft">保存草稿</button><button type="submit" class="primary" name="status" value="published">${published ? '发布更新' : '发布文章'}</button>` : `<button type="submit" class="primary">保存${labels[collection]}</button>`;
    page.innerHTML = `<div class="admin-page-head"><div><button type="button" class="admin-back" id="return-list">返回${labels[collection]}列表</button><h2>${item.id ? '编辑' : '新建'}${labels[collection]}</h2></div>${published ? '<button type="button" class="secondary" id="withdraw-post">撤回发布</button>' : ''}</div>
      <form id="content-form" class="admin-editor"><div class="admin-card ${isPost ? 'document-card' : ''}">${editorFields}</div><div class="admin-save">${actions}</div></form>`;
    const form = page.querySelector('form');
    const draftStatus = form.querySelector('.draft-save-status');
    let saveTimer;
    function scheduleDraft() {
      dirty = true;
      clearTimeout(saveTimer);
      draftStatus.dataset.error = 'false';
      draftStatus.textContent = '有未保存的更改…';
      saveTimer = setTimeout(saveDraftWhenReady,1200);
    }
    const editor = isPost ? articleEditor(form.querySelector('#article-editor'), item, scheduleDraft) : null;
    if (isPost) {
      trackForm(form,event => {
        if (['cover','coverAlt'].includes(event.target.name)) {
          form.querySelector('.editor-cover').innerHTML = coverImage({cover:form.elements.cover.value.trim(),coverAlt:form.elements.coverAlt.value.trim()});
        }
        if (!event.target.closest('#article-editor')) scheduleDraft();
      });
    } else trackForm(form);

    function submitContent(status, automatic = false) {
      const fields = Object.fromEntries(new FormData(form));
      if (editor) {
        fields.body = editor();
        fields.status = status;
      }
      save({collection,id:form.dataset.postId || entry.id || '',item:fields}, fields.status === 'published' ? '已发布到博客。' : automatic ? '草稿已自动保存。' : '草稿已保存。', form, automatic);
    }

    function saveDraftWhenReady() {
      if (!form.isConnected || !dirty) return;
      if (busy || confirmation.open) {
        saveTimer = setTimeout(saveDraftWhenReady,1200);
      } else if (!form.elements.title.value.trim()) {
        draftStatus.textContent = '填写标题后自动保存。';
      } else if (form.matches(':invalid')) {
        draftStatus.textContent = '填写有效的发布设置后自动保存。';
      } else submitContent('draft',true);
    }
    form.addEventListener('invalid', event => {
      const settings = event.target.closest('.publication-settings');
      if (settings) settings.open = true;
    },true);
    page.querySelector('#return-list').addEventListener('click', () => switchView(collection));
    page.querySelector('#withdraw-post')?.addEventListener('click', async () => {
      if (busy) return;
      const detail = '撤回后，文章将保留为草稿，读者将暂时无法访问。';
      if (await confirmAction('撤回发布？',detail + (dirty ? ' 尚未保存的改动会丢失。' : ''),'确认撤回')) {
        clearTimeout(saveTimer);
        save({collection,id:entry.id,action:'withdraw'},'已撤回发布，文章保留为草稿。');
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      clearTimeout(saveTimer);
      submitContent(event.submitter?.value || 'draft');
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

  function articleEditor(root, item, onEdit) {
    const {signal} = (editorEvents = new AbortController());
    const adminHeader = document.querySelector('.header');
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
    const typeButtons = Object.entries(types).map(([type,label]) => `<button type="button" data-type="${type}" aria-label="${label}" title="${label}">${blockMarks[type] || type.toUpperCase()}</button>`).join('');
    let documentEditor = null;
    let menu = null;
    let menuOptions = null;
    let selectionToolbar = null;
    let menuBlock = null;
    let hoverOpened = false;

    function positionBlockOptions() {
      const handle = menu.querySelector('summary').getBoundingClientRect();
      const topEdge = adminHeader.getBoundingClientRect().bottom + 8;
      const bottomEdge = window.innerHeight - 8;
      const rightEdge = document.documentElement.clientWidth - 8;
      if (handle.bottom <= topEdge || handle.top >= bottomEdge) {
        menu.open = false;
        hoverOpened = false;
        return;
      }
      menuOptions.style.maxHeight = `${bottomEdge - topEdge}px`;
      const {width,height} = menuOptions.getBoundingClientRect();
      const spaceLeft = handle.left - 8;
      const spaceRight = rightEdge - handle.right;
      const beside = Math.max(spaceLeft,spaceRight) >= width;
      const left = spaceLeft >= width ? handle.left - width + 1 : beside ? handle.right - 1 : handle.left;
      const start = beside ? handle.top : handle.bottom - 1;
      const end = beside ? handle.bottom - height : handle.top - height + 1;
      const top = start + height <= bottomEdge ? start : end;
      menuOptions.style.left = `${Math.max(8,Math.min(left,rightEdge - width))}px`;
      menuOptions.style.top = `${Math.max(topEdge,Math.min(top,bottomEdge - height))}px`;
    }

    function inlineCodeAt(range) {
      const code = range.startContainer.parentElement?.closest('code');
      return code?.contains(range.endContainer) ? code : null;
    }

    function positionSelectionToolbar() {
      if (!activeRange || activeRange.collapsed || !activeRange.toString().trim() || menu.open) {
        selectionToolbar.hidden = true;
        return;
      }
      const block = blockAt(activeRange.startContainer);
      const endBlock = blockAt(activeRange.endContainer);
      const rangeBounds = activeRange.getBoundingClientRect();
      const topEdge = adminHeader.getBoundingClientRect().bottom + 8;
      if (block?.closest('pre') || endBlock?.closest('pre') || !rangeBounds.width ||
          rangeBounds.bottom < topEdge || rangeBounds.top >= window.innerHeight) {
        selectionToolbar.hidden = true;
        return;
      }
      selectionToolbar.hidden = false;
      const {width,height} = selectionToolbar.getBoundingClientRect();
      const right = document.documentElement.clientWidth - width - 8;
      const above = rangeBounds.top - height - 8;
      const below = rangeBounds.bottom + 8;
      selectionToolbar.style.left = `${Math.max(8,Math.min(rangeBounds.left,right))}px`;
      selectionToolbar.style.top = `${Math.max(topEdge,Math.min(above >= topEdge ? above : below,window.innerHeight - height - 8))}px`;
      for (const button of selectionToolbar.querySelectorAll('button')) {
        const command = button.dataset.format;
        button.setAttribute('aria-pressed',String(command === 'code' ? Boolean(inlineCodeAt(activeRange)) : document.queryCommandState(command)));
      }
      selectionToolbar.querySelector('[data-format=code]').disabled = !block || block !== endBlock ||
        cellAt(activeRange.startContainer) !== cellAt(activeRange.endContainer);
    }

    function cellAt(node) {
      return (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('td,th');
    }

    function blockAt(node) {
      if (node?.nodeType === 3) node = node.parentElement;
      if (!node || node === documentEditor || !documentEditor?.contains(node)) return null;
      const block = node.closest('[data-block-type=table]') || node.closest('li,pre,blockquote,h1,h2,h3,h4,h5,h6,p,div');
      return block === documentEditor ? null : block;
    }

    function positionMenu(block) {
      if (menuBlock !== block) menuBlock?.classList.remove('block-menu-target');
      menuBlock = block;
      menu.hidden = !block;
      if (!block) return;
      menu.style.top = `${block.getBoundingClientRect().top - documentEditor.getBoundingClientRect().top}px`;
      const type = block.dataset.blockType || ({li:block.parentElement.localName,pre:'code',blockquote:'quote'})[block.localName] || block.localName;
      const glyph = blockMarks[type] || type.toUpperCase();
      menu.querySelector('.block-type').textContent = glyph;
      menu.querySelector('summary').setAttribute('aria-label',`当前块操作，${type === 'table' ? '表格' : types[type] || '正文'}`);
      for (const button of menu.querySelectorAll('[data-type]')) {
        button.disabled = type === 'table' && button.dataset.type !== 'table';
        button.classList.toggle('current-type',button.dataset.type === type);
      }
      menu.querySelector('.table-actions').hidden = type !== 'table';
      menu.querySelector('[data-action=up]').disabled = !block.previousElementSibling;
      menu.querySelector('[data-action=down]').disabled = !block.nextElementSibling;
      menu.querySelector('[data-action=remove]').disabled = false;
    }

    function trackSelection(showHandle = true) {
      const selection = window.getSelection();
      if (!selection.rangeCount || !documentEditor?.contains(selection.anchorNode) || !documentEditor.contains(selection.focusNode)) return;
      activeRange = selection.getRangeAt(0).cloneRange();
      if (showHandle && !menu.open) {
        const {startContainer,startOffset} = activeRange;
        const block = blockAt(startContainer) || (startContainer === documentEditor &&
          (blockAt(documentEditor.childNodes[startOffset]) || blockAt(documentEditor.childNodes[startOffset - 1]))) ||
          documentEditor.firstElementChild;
        positionMenu(block);
      }
    }

    document.addEventListener('selectionchange', () => {
      if (!documentEditor || selectionToolbar.contains(document.activeElement)) return;
      const selection = window.getSelection();
      if (documentEditor.contains(selection.anchorNode) && documentEditor.contains(selection.focusNode)) {
        trackSelection();
        positionSelectionToolbar();
      } else {
        selectionToolbar.hidden = true;
      }
    }, {signal});
    function positionOverlays() {
      if (!documentEditor) return;
      if (menu.open) positionBlockOptions();
      if (!selectionToolbar.hidden) positionSelectionToolbar();
    }
    window.addEventListener('scroll',positionOverlays,{signal,passive:true});
    window.addEventListener('resize',positionOverlays,{signal});

    function sync() {
      markdown = markdownSource(readDocument(documentEditor));
      exportButton.disabled = !markdown.trim();
      onEdit();
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
      onEdit();
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
        canvas.innerHTML = `<div class="editor-preview reading">${renderMarkdown(parseMarkdown(markdown),true) || '<p class="subtle">还没有正文。</p>'}</div>`;
      } else {
        canvas.innerHTML = `<div class="document-workspace"><details class="block-menu" hidden><summary aria-label="当前块操作"><span class="block-type" aria-hidden="true">T</span><span aria-hidden="true">⋮⋮</span></summary><div class="block-options"><div class="block-type-grid" role="group" aria-label="块类型">${typeButtons}</div><div class="table-actions" hidden><button type="button" data-action="table-row">＋ 行</button><button type="button" data-action="table-column">＋ 列</button></div><p>格式</p><button type="button" data-command="bold">加粗</button><p>块操作</p><button type="button" data-action="add">在下方添加</button><button type="button" data-action="up" disabled>上移</button><button type="button" data-action="down" disabled>下移</button><button type="button" data-action="remove" disabled>删除此块</button></div></details><div class="document-editor reading" contenteditable="true" role="textbox" aria-label="文章正文" aria-multiline="true" spellcheck="false">${renderMarkdown(parseMarkdown(markdown)) || '<p><br></p>'}</div></div><p class="subtle editor-hint">指向正文块可打开左侧菜单，空白块也可以按 /。</p>`;
        documentEditor = canvas.querySelector('.document-editor');
        menu = canvas.querySelector('.block-menu');
        menuOptions = menu.querySelector('.block-options');
        selectionToolbar = document.createElement('div');
        selectionToolbar.className = 'selection-toolbar';
        selectionToolbar.hidden = true;
        selectionToolbar.setAttribute('role','group');
        selectionToolbar.setAttribute('aria-label','选中文字格式');
        selectionToolbar.innerHTML = '<button type="button" data-format="bold" aria-label="加粗" title="加粗"><b>B</b></button><button type="button" data-format="italic" aria-label="斜体" title="斜体"><i>I</i></button><button type="button" data-format="strikeThrough" aria-label="删除线" title="删除线"><s>S</s></button><button type="button" data-format="code" aria-label="行内代码" title="行内代码">&lt;/&gt;</button>';
        documentEditor.after(selectionToolbar);
        menu.addEventListener('toggle', event => {
          if (event.currentTarget !== menu) return;
          menuBlock?.classList.toggle('block-menu-target',menu.open);
          if (menu.open) {
            selectionToolbar.hidden = true;
            positionBlockOptions();
          }
        });
        if (savedDocument?.markdown === markdown) documentEditor.innerHTML = savedDocument.html;
        else if (savedDocument) record(savedDocument);
        savedDocument = null;
      }
    }

    function appendTableRow(table) {
      const row = table.tBodies[0].insertRow();
      [...table.rows[0].cells].forEach(cell => {
        const next = row.insertCell();
        if (cell.dataset.align) next.dataset.align = cell.dataset.align;
        next.append(document.createElement('br'));
      });
      return row.cells[0];
    }

    function changeBlock(button, block) {
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
      if (action === 'table-row' || action === 'table-column') {
        const table = block.querySelector('table');
        if (action === 'table-row') placeCursor(appendTableRow(table));
        else {
          for (const row of table.rows) {
            const cell = document.createElement(row.sectionRowIndex === 0 && row.parentElement === table.tHead ? 'th' : 'td');
            if (cell.localName === 'th') cell.scope = 'col';
            cell.append(document.createElement('br'));
            row.append(cell);
          }
          placeCursor(table.rows[0].lastElementChild);
        }
        return;
      }
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
        const neighbor = block.nextElementSibling || block.previousElementSibling;
        const parent = block.parentElement;
        block.remove();
        if (parent !== documentEditor && !parent.children.length) parent.remove();
        if (!documentEditor.children.length) documentEditor.innerHTML = '<p><br></p>';
        placeCursor(neighbor || documentEditor.firstElementChild);
        return;
      }

      const type = button.dataset.type;
      if (type === 'table') {
        const after = block.localName === 'li' ? block.parentElement : block;
        after.insertAdjacentHTML('afterend',renderMarkdown([{type:'table',rows:[['','',''],['','',''],['','','']],alignment:['---','---','---']}]));
        const table = after.nextElementSibling;
        if (block.localName === 'p' && !block.textContent.trim()) block.remove();
        placeCursor(table.querySelector('th'));
      } else if (type === 'code' && block.localName !== 'pre') {
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

    root.addEventListener('click', async event => {
      if (menu?.contains(event.target) && event.target.closest('summary')) {
        event.preventDefault();
        if (hoverOpened) hoverOpened = false;
        else {
          menu.open = !menu.open;
          if (menu.open) positionBlockOptions();
        }
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
      if ('copy' in button.dataset && canvas.contains(button)) {
        try {
          await navigator.clipboard.writeText(button.closest('.code-panel').querySelector('code').textContent);
          button.textContent = '已复制';
        } catch { button.textContent = '请手动复制'; }
        return;
      }
      if (button.dataset.mode) {
        if (mode === button.dataset.mode) return;
        if (documentEditor) savedDocument = snapshot();
        mode = button.dataset.mode;
        paint();
      } else if ('restore' in button.dataset) {
        if (markdown.trim() && !await confirmAction('替换当前正文？','将用原浏览器草稿替换当前正文。','替换正文')) return;
        if (documentEditor) savedDocument = snapshot();
        markdown = legacy;
        onEdit();
        paint();
      } else if ('export' in button.dataset) {
        download(`${item.id || 'itfetter-draft'}.md`,markdown,'text/markdown;charset=utf-8');
      } else if (menu?.contains(button)) {
        const block = menuBlock;
        if (button.dataset.action === 'remove' && block?.textContent.trim() &&
            !await confirmAction('删除正文块？','可以在编辑器中撤销这次删除。','删除正文块',true)) return;
        applyEdit(() => changeBlock(button,block));
      } else if (button.dataset.format && activeRange) {
        const range = activeRange.cloneRange();
        documentEditor.focus();
        selectRange(range);
        applyEdit(() => {
          if (button.dataset.format !== 'code') {
            document.execCommand(button.dataset.format);
            return;
          }
          const existing = inlineCodeAt(range);
          if (existing) {
            const text = document.createTextNode(existing.textContent);
            existing.replaceWith(text);
            range.selectNodeContents(text);
            selectRange(range);
            return;
          }
          const code = document.createElement('code');
          code.textContent = range.toString();
          range.deleteContents();
          range.insertNode(code);
          range.selectNodeContents(code);
          selectRange(range);
        });
        positionSelectionToolbar();
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
        onEdit();
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
        if (current?.closest('pre') || cellAt(activeRange?.startContainer)) {
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
      positionBlockOptions();
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
      if ((menu?.contains(event.target) || selectionToolbar?.contains(event.target)) && event.button === 0) {
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
      if (key === 'tab' && !event.altKey && !event.ctrlKey && !event.metaKey && documentEditor.contains(event.target)) {
        const cell = cellAt(window.getSelection()?.anchorNode);
        if (cell) {
          const table = cell.closest('table');
          const cells = [...table.querySelectorAll('th,td')];
          const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
          if (next || !event.shiftKey) {
            event.preventDefault();
            if (next) placeCursor(next);
            else applyEdit(() => placeCursor(appendTableRow(table)));
          }
          return;
        }
      }
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
          positionBlockOptions();
          menu.querySelector('button').focus();
        }
      } else if (event.key === 'Escape' && menu.open && activeRange) {
        hoverOpened = false;
        menu.open = false;
        documentEditor.focus();
        selectRange(activeRange);
      } else if (event.key === 'Escape' && !selectionToolbar.hidden) {
        event.preventDefault();
        selectionToolbar.hidden = true;
        documentEditor.focus();
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
