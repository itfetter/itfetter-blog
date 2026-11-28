(() => {
  const page = document.querySelector('#admin-page');
  const feedback = document.querySelector('#admin-status');
  const confirmation = document.querySelector('#admin-confirm');
  const {escape, blocks:parseMarkdown, source:markdownSource, render:renderReading, fromDocument:readDocument, clipboardBlocks, coverImage, inkColors, highlightColors, schemeColor} = window.blogMarkdown;
  const renderMarkdown = (...args) => renderReading(...args).replaceAll('src="/media/','src="/admin/media/');
  const imageFormats = 'image/png,image/jpeg,image/webp,image/gif';
  const labels = {posts:'文章',notes:'笔记',projects:'项目'};
  const types = {p:'正文',h1:'一级标题',h2:'二级标题',h3:'三级标题',h4:'四级标题',h5:'五级标题',h6:'六级标题',ol:'有序列表',ul:'无序列表',quote:'引用',code:'代码块',table:'插入表格',callout:'高亮块'};
  const blockMarks = {p:'T',div:'T',quote:'❝',code:'‹›',table:'▦',callout:'<span class="callout-mark" aria-hidden="true"></span>'};
  const blockIcon = type => type === 'ul' || type === 'ol' ?
    `<span class="list-mark" aria-hidden="true">${[1,2,3].map(number => `<span><i>${type === 'ol' ? number : '•'}</i></span>`).join('')}</span>` :
    blockMarks[type] || escape(type.toUpperCase());
  const colorLabels = {gray:'灰色',red:'红色',orange:'橙色',yellow:'黄色',green:'绿色',blue:'蓝色',purple:'紫色'};
  const swatches = (kind,colors,label) => [['default',''],...Object.entries(colors)].map(([name,value]) => {
    const title = `${label}：${colorLabels[name] || (kind === 'ink' ? '默认' : '无')}`;
    return `<button type="button" class="color-swatch" data-color-kind="${kind}" data-color="${name}" aria-label="${title}" title="${title}"${value ? ` style="--swatch:${schemeColor(value)}"` : ''}>${kind === 'ink' ? 'A' : ''}</button>`;
  }).join('');
  const input = (name, label, value, limit, type = 'text', required = true) => `<label class="admin-field">${label}<input name="${name}" type="${type}" value="${escape(value || '')}" maxlength="${limit}"${required ? ' required' : ''}></label>`;
  const textarea = (name, label, value, limit, required = true) => `<label class="admin-field">${label}<textarea name="${name}" maxlength="${limit}"${required ? ' required' : ''}>${escape(value || '')}</textarea></label>`;
  const select = (name, label, options, selected) => `<label class="admin-field">${label}<select name="${name}">${options.map(([value,text]) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
  let data;
  const requestedView = location.hash.slice(1);
  let view = Object.hasOwn(labels,requestedView) || requestedView === 'settings' ? requestedView : 'overview';
  let dirty = false;
  let busy = false;
  let editorEvents;
  const listFilters = {};

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

  async function api(change, endpoint = '/admin/content') {
    let response;
    try {
      response = await fetch(endpoint, change === undefined ? {} : {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(change),
      });
    } catch {
      throw new Error('连接失败，请重试。');
    }
    if (response.status === 401) {
      location.assign('/admin');
      throw new Error('登录已过期，请重新登录。');
    }
    const payload = await response.json().catch(() => { throw new Error('服务暂时无法响应，请重试。'); });
    if (!response.ok) throw new Error(payload.error || '操作失败，请重试。');
    return payload;
  }

  function notify(message, error = false) {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  }

  function showStatus(element, text, state = 'idle') {
    element.textContent = text;
    element.dataset.state = state;
  }

  async function uploadImage(file) {
    if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('每张图片最大 8 MB。');
    const response = await fetch('/admin/media',{method:'POST',body:file}).catch(() => {
      throw new Error('连接失败，请重试。');
    });
    if (response.status === 413) throw new Error('图片超过上传大小限制。');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '图片上传失败，请重试。');
    return result.url;
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
    const statuses = [['','全部'],['published','已发布'],['draft','草稿']];
    if (view === 'posts') statuses.push(['revision','有草稿']);
    page.innerHTML = `<div class="admin-page-head"><div><h2>${label}</h2><p>管理已发布内容和草稿。</p></div><button type="button" class="primary" id="new-item">新建${label}</button></div>
      <div class="admin-list"><div class="admin-filters"><label class="admin-query"><span>搜索${label}</span><input type="search" id="item-query" placeholder="输入标题关键词"></label>
      <fieldset id="item-status"><legend>发布状态</legend><div>${statuses.map(([value,name]) => `<label><input type="radio" name="item-status" value="${value}"${value === (listFilters[view]?.status || '') ? ' checked' : ''}><span>${name}</span></label>`).join('')}</div></fieldset><p class="admin-action-status" id="list-result" role="status"></p><p class="subtle" id="item-count" role="status"></p></div><div id="item-rows"></div></div>`;
    const query = page.querySelector('#item-query');
    const state = page.querySelector('#item-status');
    const rows = page.querySelector('#item-rows');
    const result = page.querySelector('#list-result');
    if (listFilters[view]) {
      query.value = listFilters[view].query;
    }
    function articleMetrics(id) {
      const engagement = data.engagement?.[id];
      return `<small class="admin-article-stats"><span>浏览 ${engagement?.views ?? 0}</span><span>评论 ${data.comments?.[id]?.length ?? 0}</span><span>点赞 ${engagement?.likes.length ?? 0}</span></small>`;
    }
    function refresh() {
      const filter = state.querySelector(':checked').value;
      listFilters[view] = {query:query.value,status:filter};
      const keyword = query.value.trim().toLowerCase();
      const visible = data[view].filter(item => (!filter || item.status === filter || (filter === 'revision' && item.draft)) && [item.title,item.draft?.title].some(title => title?.toLowerCase().includes(keyword)));
      page.querySelector('#item-count').textContent = `共 ${visible.length} 条`;
      rows.innerHTML = visible.length ? `<ul>${[...visible].sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(item => `<li><div><strong class="admin-item-title">${escape(item.title)}</strong><small>${escape(item.date || item.kind || '')}${item.topic ? ` · ${escape(data.topics[item.topic])}` : ''}</small>${view === 'posts' ? articleMetrics(item.id) : ''}</div><div class="admin-states"><span class="admin-state ${item.status}">${item.status === 'published' ? '已发布' : '草稿'}</span>${item.draft ? '<span class="admin-state">有草稿</span>' : ''}</div><div class="admin-row-actions"><button type="button" data-edit="${item.id}" aria-label="编辑 ${escape(item.title)}">编辑</button>${view === 'posts' && item.status === 'published' ? `<a href="/#post/${item.id}" target="_blank" rel="noopener">查看</a>` : ''}<button type="button" data-delete="${item.id}" aria-label="删除 ${escape(item.title)}">删除</button></div></li>`).join('')}</ul>` : `<div class="admin-empty"><p>${query.value || filter ? '没有符合条件的内容。' : `还没有${label}。`}</p>${query.value || filter ? '<button type="button" class="secondary" id="reset-items">清除筛选</button>' : ''}</div>`;
    }
    query.addEventListener('input',refresh);
    state.addEventListener('change',refresh);
    page.querySelector('#new-item').addEventListener('click', () => openEditor());
    rows.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || busy) return;
      if (button.id === 'reset-items') {
        query.value = '';
        state.querySelector('input[value=""]').checked = true;
        query.focus();
        refresh();
      } else if (button.dataset.edit) openEditor(data[view].find(item => item.id === button.dataset.edit));
      else if (button.dataset.delete) {
        const item = data[view].find(item => item.id === button.dataset.delete);
        if (await confirmAction(`删除${label}？`,`「${item.title}」将从后台和前台移除。`,'确认删除',true)) {
          const nextRow = button.closest('li').nextElementSibling || button.closest('li').previousElementSibling;
          const nextId = nextRow?.querySelector('[data-edit]').dataset.edit;
          await save({collection:view,id:item.id,item:null},{
            pending:'正在删除…', message:`已删除「${item.title}」。`, status:result, buttons:[button],
            onSaved() {
              refresh();
              ([...rows.querySelectorAll('[data-edit]')].find(button => button.dataset.edit === nextId) || query).focus({preventScroll:true});
            }
          });
        }
      }
    });
    refresh();
  }

  async function save(change, {pending,message,status,form,buttons = [],onSaved}) {
    if (busy) return;
    busy = true;
    const wasDirty = dirty;
    if (form) dirty = false;
    buttons.forEach(button => button.setAttribute('aria-disabled','true'));
    showStatus(status,pending,'pending');
    try {
      data = await api(change);
      const feedback = onSaved?.() || status;
      showStatus(feedback,dirty && form ? `${message}有新的改动待保存。` : message,'success');
    } catch (error) {
      if (form) dirty ||= wasDirty;
      showStatus(status,error.message,'error');
    } finally {
      busy = false;
      buttons.forEach(button => button.removeAttribute('aria-disabled'));
    }
  }

  function trackForm(form, onChange = () => { dirty = true; }) {
    form.addEventListener('input',onChange);
    form.addEventListener('change',onChange);
  }

  function saveBar(buttons, initial = '') {
    return `<div class="admin-save"><p class="admin-action-status" data-save-status role="status">${initial}</p><div class="admin-save-buttons">${buttons}</div></div>`;
  }

  function openEditor(entry = {}, focus = true) {
    editorEvents?.abort();
    const collection = view;
    const isPost = collection === 'posts';
    const item = entry.draft || entry;
    let itemId = entry.id || '';
    let published = isPost && entry.status === 'published';
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const status = select('status','发布状态', [['draft','草稿'],['published','已发布']], item.status || 'draft');
    const date = input('date','发布日期',item.date || localDate,10,'date');
    const kind = input('kind',collection === 'notes' ? '笔记类别' : '项目进度',item.kind,40);
    const articleOptions = [['','无关联'],...data.posts.map(post => [post.id,post.title])];
    const fields = isPost ? `${select('topic','文章主题',Object.entries(data.topics),item.topic || Object.keys(data.topics)[0])}${date}` : `${kind}${collection === 'notes' ? date : select('post','关联文章',articleOptions,item.post || '')}${status}`;
    const details = `${textarea('text','简短说明',item.text,350)}${textarea('detail',collection === 'notes' ? '笔记正文（Markdown）' : '项目详情（Markdown）',item.detail,8000,false)}${collection === 'projects' ? input('url','项目链接',item.url,300,'url',false) : ''}`;
    const editorFields = isPost ? `<div class="document-header">${input('title','文章标题',item.title,150)}<details class="publication-settings"><summary>发布设置</summary><div class="admin-fields">${fields}</div>${textarea('summary','文章摘要',item.summary,350,false)}<div class="admin-fields">${input('cover','封面图片地址',item.cover,500,'text',false)}${input('coverAlt','封面替代文字',item.coverAlt,150,'text',false)}</div><div class="admin-export"><button type="button" class="secondary" data-cover-upload>上传封面</button><input type="file" accept="${imageFormats}" hidden data-cover-file><span class="admin-action-status" role="status" data-cover-status></span></div></details></div><div class="editor-cover">${coverImage(item,true)}</div><section id="article-editor"></section>` : `${input('title','标题',item.title,150)}<div class="admin-fields">${fields}</div>${details}`;
    const actions = isPost ? `<a class="secondary" data-live-post target="_blank" rel="noopener" hidden>查看前台</a><button type="submit" class="secondary" name="status" value="draft">保存草稿</button><button type="submit" class="primary" name="status" value="published"></button>` : `<button type="submit" class="primary">保存${labels[collection]}</button>`;
    const initial = isPost ? (entry.draft || entry.status === 'draft' ? '草稿已保存。' : '编辑后会自动保存草稿。') : '';
    page.innerHTML = `<div class="admin-page-head"><div><button type="button" class="admin-back" id="return-list">← 返回${labels[collection]}列表</button><h2>${itemId ? '编辑' : '新建'}${labels[collection]}</h2></div>${isPost ? '<button type="button" class="secondary" id="withdraw-post" hidden>撤回发布</button>' : ''}</div>
      <form id="content-form" class="admin-editor"><div class="admin-card ${isPost ? 'document-card' : ''}">${editorFields}</div>${saveBar(actions,initial)}</form>`;
    const form = page.querySelector('#content-form');
    const feedback = form.querySelector('[data-save-status]');
    const withdraw = page.querySelector('#withdraw-post');
    const buttons = [...form.querySelectorAll('[type=submit]'),...(withdraw ? [withdraw] : [])];
    let saveTimer;
    let draftRequest;
    let manualPending = false;

    function updateEditor(saved) {
      itemId = saved.id || '';
      form.dataset.itemId = itemId;
      if (itemId) page.querySelector('.admin-page-head h2').textContent = `编辑${labels[collection]}`;
      if (!isPost) return;
      published = saved.status === 'published';
      withdraw.hidden = !published;
      form.querySelector('[value=published]').textContent = published ? '发布更新' : '发布文章';
      const live = form.querySelector('[data-live-post]');
      live.hidden = !published;
      if (published) live.href = `/#post/${itemId}`;
    }
    if (isPost) updateEditor(entry);

    function scheduleDraft() {
      dirty = true;
      clearTimeout(saveTimer);
      if (!busy && !manualPending) showStatus(feedback,'有未保存的更改。');
      saveTimer = setTimeout(saveDraftWhenReady,1200);
    }
    const editor = isPost ? articleEditor(form.querySelector('#article-editor'), item, scheduleDraft) : null;
    if (isPost) {
      const trigger = form.querySelector('[data-cover-upload]');
      const picker = form.querySelector('[data-cover-file]');
      const result = form.querySelector('[data-cover-status]');
      trigger.onclick = () => picker.click();
      picker.onchange = async () => {
        const file = picker.files[0];
        if (!file) return;
        picker.value = '';
        trigger.disabled = true;
        showStatus(result,'正在上传封面…','pending');
        try {
          form.elements.cover.value = await uploadImage(file);
          form.elements.cover.dispatchEvent(new Event('input',{bubbles:true}));
          showStatus(result,'封面已添加。','success');
        } catch (error) {
          showStatus(result,error.message,'error');
        } finally {
          trigger.disabled = false;
        }
      };
    }
    trackForm(form,event => {
      if (isPost) {
        if (['cover','coverAlt'].includes(event.target.name)) {
          form.querySelector('.editor-cover').innerHTML = coverImage({cover:form.elements.cover.value.trim(),coverAlt:form.elements.coverAlt.value.trim()},true);
        }
        if (!event.target.closest('#article-editor')) scheduleDraft();
      } else {
        dirty = true;
        if (!busy) showStatus(feedback,'有未保存的更改。');
      }
    });

    function readFields(status) {
      const values = Object.fromEntries(new FormData(form));
      if (editor) {
        values.body = editor();
        values.status = status;
      }
      return values;
    }

    function submitContent(values, automatic = false) {
      const isPublishing = isPost && values.status === 'published';
      return save({collection,id:itemId,item:values},{
        form,status:feedback,buttons:automatic ? [] : buttons,
        pending:automatic ? '正在自动保存…' : isPublishing ? '正在发布…' : '正在保存…',
        message:isPublishing ? '已发布到博客。' : isPost ? (automatic ? '草稿已自动保存。' : '草稿已保存。') : `${labels[collection]}已保存。`,
        onSaved() { updateEditor(itemId ? data[collection].find(item => item.id === itemId) : data[collection].at(-1)); }
      });
    }

    function saveDraftWhenReady() {
      if (!form.isConnected || !dirty) return;
      if (busy || manualPending || confirmation.open) {
        saveTimer = setTimeout(saveDraftWhenReady,1200);
      } else if (!form.elements.title.value.trim()) {
        showStatus(feedback,'填写标题后会自动保存。');
      } else if (form.matches(':invalid')) {
        showStatus(feedback,'填写有效的发布设置后会自动保存。');
      } else {
        draftRequest = submitContent(readFields('draft'),true);
      }
    }
    form.addEventListener('invalid', event => {
      const settings = event.target.closest('.publication-settings');
      if (settings) settings.open = true;
    },true);
    page.querySelector('#return-list').addEventListener('click', () => switchView(collection));
    withdraw?.addEventListener('click', async () => {
      if (manualPending) return;
      manualPending = true;
      try {
        await draftRequest;
        if (!form.isConnected || busy || !published) return;
        const detail = '撤回后，文章将保留为草稿，读者将暂时无法访问。';
        if (!await confirmAction('撤回发布？',detail + (dirty ? ' 尚未保存的改动会丢失。' : ''),'确认撤回',true)) return;
        clearTimeout(saveTimer);
        const discard = dirty;
        await save({collection,id:itemId,action:'withdraw'},{
          form,status:feedback,buttons,pending:'正在撤回…',message:'已撤回发布，文章保留为草稿。',
          onSaved() {
            const saved = data[collection].find(item => item.id === itemId);
            if (discard && !dirty) {
              openEditor(saved,false);
              const next = page.querySelector('[data-save-status]');
              page.querySelector('#return-list').focus({preventScroll:true});
              return next;
            }
            updateEditor(saved);
            form.querySelector('[value=draft]').focus({preventScroll:true});
          }
        });
      } finally {
        manualPending = false;
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (manualPending) return;
      manualPending = true;
      try {
        await draftRequest;
        if (!form.isConnected || busy) return;
        const status = event.submitter?.value || 'draft';
        const values = readFields(status);
        if (isPost && status === 'published') {
          if (!values.summary.trim() || !values.body.trim()) {
            showStatus(feedback,'发布前请填写文章摘要和正文。','error');
            if (!values.summary.trim()) {
              form.querySelector('.publication-settings').open = true;
              form.elements.summary.focus({preventScroll:true});
            }
            return;
          }
          const action = published ? '发布更新' : '发布文章';
          const detail = published ? '发布后，读者会看到本次编辑的版本。' : '发布后，读者可以在博客上看到这篇文章。';
          if (!await confirmAction(`${action}？`,detail,action)) return;
        }
        clearTimeout(saveTimer);
        await submitContent(values);
      } finally {
        manualPending = false;
      }
    });
    if (focus) form.querySelector('[name=title]').focus();
  }

  function settingsForm() {
    const {settings} = data;
    const featured = [['','不置顶'],...data.posts.filter(post => post.status === 'published').map(post => [post.id,post.title])];
    page.innerHTML = `<div class="admin-page-head"><div><h2>站点设置</h2><p>保存后会更新前台首页、关于页和页脚。</p></div></div>
      <details class="admin-card password-settings">
        <summary>修改登录密码</summary>
        <form id="password-settings" method="post" action="/admin/password">
          <label class="admin-field">当前密码<input type="password" name="current" autocomplete="current-password" required></label>
          <label class="admin-field">新密码<input type="password" name="new" autocomplete="new-password" minlength="6" maxlength="256" required aria-describedby="password-hint"></label>
          <label class="admin-field">确认新密码<input type="password" name="confirm" autocomplete="new-password" minlength="6" maxlength="256" required></label>
          <p id="password-hint">至少 6 位。保存后请使用新密码重新登录。</p>
          <p class="form-error" role="alert" hidden></p>
          <button type="submit" class="primary">保存新密码</button>
        </form>
      </details>
      <form class="admin-editor"><div class="admin-card"><div class="admin-fields">${input('title','博客名称',settings.title,70)}${input('author','作者名称',settings.author,50)}</div>${textarea('description','首页介绍',settings.description,350)}${textarea('about','关于页正文（Markdown）',settings.about,8000)}${input('github','GitHub 链接',settings.github,300,'url',false)}${select('featured','首页置顶文章',featured,settings.featured)}</div>${saveBar('<button type="submit" class="primary">保存设置</button>')}</form>
      <section class="admin-card"><h3>静态站点导出</h3><p>导出已发布内容和站点设置，用于更新静态站点。草稿不会写入导出文件。</p><div class="admin-export"><button type="button" class="secondary" id="export-site">导出公开 content.js</button><span class="admin-action-status" id="export-result" role="status"></span></div></section>`;
    const form = page.querySelector('.admin-editor');
    const saveResult = form.querySelector('[data-save-status]');
    trackForm(form,() => {
      dirty = true;
      if (!busy) showStatus(saveResult,'有未保存的更改。');
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      save({collection:'settings',item:Object.fromEntries(new FormData(form))},{
        form,status:saveResult,buttons:[form.querySelector('[type=submit]')],pending:'正在保存设置…',message:'站点设置已保存，前台已更新。'
      });
    });
    const passwordForm = page.querySelector('#password-settings');
    passwordForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = passwordForm.querySelector('button');
      if (button.disabled) return;
      const error = passwordForm.querySelector('[role=alert]');
      const values = Object.fromEntries(new FormData(passwordForm));
      error.hidden = true;
      if (values.new !== values.confirm) {
        error.textContent = '两次输入的新密码不一致。';
        error.hidden = false;
        passwordForm.elements.confirm.focus();
        return;
      }
      button.disabled = true;
      button.textContent = '正在保存…';
      try {
        await api(values,'/admin/password');
        passwordForm.reset();
        location.assign('/admin?password=changed');
      } catch (reason) {
        error.textContent = reason.message;
        error.hidden = false;
        button.disabled = false;
        button.textContent = '保存新密码';
      }
    });
    page.querySelector('#export-site').addEventListener('click', async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      const result = page.querySelector('#export-result');
      button.disabled = true;
      showStatus(result,'正在准备导出…','pending');
      try {
        const response = await fetch('/content.js');
        if (!response.ok) throw new Error();
        download('content.js',await response.text(),'text/javascript;charset=utf-8');
        showStatus(result,'已发起下载。','success');
      } catch {
        showStatus(result,'公开内容导出失败，请重试。','error');
      } finally { button.disabled = false; }
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
    root.innerHTML = `<div class="editor-toolbar"><div class="editor-modes" role="group" aria-label="正文编辑模式"><button type="button" data-mode="document">文档编辑</button><button type="button" data-mode="source">Markdown</button><button type="button" data-mode="preview">预览</button></div><div class="admin-export"><button type="button" class="secondary" data-image-upload>插入图片</button><input type="file" accept="${imageFormats}" multiple hidden data-image-file><button type="button" class="secondary" data-export>导出 .md</button></div></div>
      <div class="admin-action-status editor-upload-status" data-editor-status role="status"></div>
      ${legacy ? '<button type="button" class="secondary" data-restore>带入原浏览器草稿</button>' : ''}<div id="article-canvas"></div>`;
    const canvas = root.querySelector('#article-canvas');
    const exportButton = root.querySelector('[data-export]');
    const imageButton = root.querySelector('[data-image-upload]');
    const imagePicker = root.querySelector('[data-image-file]');
    const editorStatus = root.querySelector('[data-editor-status]');
    const typeButtons = Object.entries(types).map(([type,label]) => `<button type="button" data-type="${type}" aria-label="${label}" title="${label}">${blockIcon(type)}</button>`).join('');
    let documentEditor = null;
    let menu = null;
    let menuOptions = null;
    let selectionToolbar = null;
    let colorPalette = null;
    let tablePicker = null;
    let tableTools = null;
    let tableMenu = null;
    let activeTable = null;
    let tableTarget = null;
    let menuBlock = null;
    let hoverOpened = false;
    let uploading = false;

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

    function showColorPalette(show) {
      colorPalette.hidden = !show;
      const trigger = selectionToolbar.querySelector('[data-color-toggle]');
      trigger.setAttribute('aria-expanded',String(show));
      if (!show) return;
      const bounds = trigger.getBoundingClientRect();
      const {width,height} = colorPalette.getBoundingClientRect();
      const topEdge = adminHeader.getBoundingClientRect().bottom + 8;
      const bottomEdge = window.innerHeight - 8;
      const below = bounds.bottom + 9;
      const above = bounds.top - height - 9;
      const top = below + height <= bottomEdge || above < topEdge ? below : above;
      colorPalette.style.left = `${Math.max(8,Math.min(bounds.right - width,document.documentElement.clientWidth - width - 8))}px`;
      colorPalette.style.top = `${Math.max(topEdge,Math.min(top,bottomEdge - height))}px`;
    }

    function positionSelectionToolbar() {
      if (!activeRange || activeRange.collapsed || !activeRange.toString().trim() || menu.open) {
        selectionToolbar.hidden = true;
        showColorPalette(false);
        return;
      }
      const block = blockAt(activeRange.startContainer);
      const endBlock = blockAt(activeRange.endContainer);
      const rangeBounds = activeRange.getBoundingClientRect();
      const topEdge = adminHeader.getBoundingClientRect().bottom + 8;
      if (block?.closest('pre') || endBlock?.closest('pre') || !rangeBounds.width ||
          rangeBounds.bottom < topEdge || rangeBounds.top >= window.innerHeight) {
        selectionToolbar.hidden = true;
        showColorPalette(false);
        return;
      }
      selectionToolbar.hidden = false;
      const {width,height} = selectionToolbar.getBoundingClientRect();
      const right = document.documentElement.clientWidth - width - 8;
      const above = rangeBounds.top - height - 8;
      const below = rangeBounds.bottom + 8;
      selectionToolbar.style.left = `${Math.max(8,Math.min(rangeBounds.left,right))}px`;
      selectionToolbar.style.top = `${Math.max(topEdge,Math.min(above >= topEdge ? above : below,window.innerHeight - height - 8))}px`;
      for (const button of selectionToolbar.querySelectorAll('[data-format]')) {
        const command = button.dataset.format;
        button.setAttribute('aria-pressed',String(command === 'code' ? Boolean(inlineCodeAt(activeRange)) : document.queryCommandState(command)));
      }
      selectionToolbar.querySelector('[data-format=code]').disabled = !block || block !== endBlock ||
        cellAt(activeRange.startContainer) !== cellAt(activeRange.endContainer);
      if (!colorPalette.hidden) showColorPalette(true);
    }

    function cellAt(node) {
      return (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('td,th');
    }

    function blockAt(node) {
      if (node?.nodeType === 3) node = node.parentElement;
      if (!node || node === documentEditor || !documentEditor?.contains(node)) return null;
      const block = node.closest('[data-block-type=table],[data-block-type=callout]') || node.closest('li,pre,blockquote,h1,h2,h3,h4,h5,h6,p,div');
      return block === documentEditor ? null : block;
    }

    function positionMenu(block) {
      if (menuBlock !== block) menuBlock?.classList.remove('block-menu-target');
      menuBlock = block;
      menu.hidden = !block;
      positionTableTools(block?.matches('[data-block-type=table]') ? block : null);
      if (!block) return;
      menu.style.top = `${block.getBoundingClientRect().top - documentEditor.getBoundingClientRect().top}px`;
      const type = block.dataset.blockType || ({li:block.parentElement.localName,pre:'code',blockquote:'quote'})[block.localName] || block.localName;
      menu.querySelector('.block-type').innerHTML = blockIcon(type);
      menu.querySelector('summary').setAttribute('aria-label',`当前块操作，${type === 'table' ? '表格' : types[type] || '正文'}`);
      for (const button of menu.querySelectorAll('[data-type]')) {
        button.disabled = type === 'table';
        button.classList.toggle('current-type',button.dataset.type === type);
      }
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
        showColorPalette(false);
      }
    }, {signal});
    function positionOverlays() {
      if (!documentEditor) return;
      if (menu.open) positionBlockOptions();
      if (!selectionToolbar.hidden) positionSelectionToolbar();
      if (activeTable) positionTableTools(activeTable);
    }
    window.addEventListener('scroll',positionOverlays,{signal,passive:true});
    window.addEventListener('resize',positionOverlays,{signal});
    canvas.addEventListener('scroll',positionOverlays,{capture:true,passive:true});

    function paintTableSize(choice) {
      const row = Number(choice.dataset.rows);
      const column = Number(choice.dataset.columns);
      tablePicker.querySelector('output').value = `${row} 行 × ${column} 列`;
      for (const tile of tablePicker.querySelectorAll('[data-rows]')) {
        tile.classList.toggle('picked',Number(tile.dataset.rows) <= row && Number(tile.dataset.columns) <= column);
        tile.tabIndex = tile === choice ? 0 : -1;
      }
    }

    function closeTableMenu() {
      tableMenu.hidden = true;
      tableTarget?.setAttribute('aria-expanded','false');
      tableTarget = null;
      tableTools.querySelector('.table-guide').hidden = true;
    }

    function positionTableTools(block, rebuild = false) {
      if (!tableTools || !tableMenu) return;
      const changed = block !== activeTable;
      activeTable = block?.isConnected ? block : null;
      tableTools.hidden = !activeTable;
      if (changed || !activeTable || rebuild) closeTableMenu();
      if (!activeTable) return;
      const table = activeTable.querySelector('table');
      const columns = [...table.rows[0].cells];
      const rows = [...table.rows];
      if (changed || rebuild || tableTools.querySelectorAll('button').length !== rows.length + columns.length) {
        for (const [axis,items,label] of [['column',columns,'列'],['row',rows,'行']]) {
          tableTools.querySelector(`[data-rail=${axis}]`).innerHTML = items.map((_,index) =>
            `<button type="button" data-axis="${axis}" data-index="${index}" aria-controls="table-axis-menu" aria-expanded="false" aria-label="第 ${index + 1} ${label}操作" title="第 ${index + 1} ${label}操作"></button>`).join('');
        }
      }
      const origin = tableTools.getBoundingClientRect();
      const bounds = activeTable.getBoundingClientRect();
      for (const button of tableTools.querySelectorAll('button')) {
        const column = button.dataset.axis === 'column';
        const rect = (column ? columns : rows)[button.dataset.index].getBoundingClientRect();
        const x = column ? (rect.left + rect.right) / 2 : bounds.left - 9;
        button.hidden = column && (x < bounds.left || x >= bounds.right);
        button.style.left = `${x - origin.left}px`;
        button.style.top = `${(column ? bounds.top - 10 : (rect.top + rect.bottom) / 2) - origin.top}px`;
      }
      if (tableTarget) {
        if (tableTarget.hidden) closeTableMenu();
        else positionTableMenu();
      }
    }

    function positionTableMenu() {
      const anchor = tableTarget.getBoundingClientRect();
      const rect = tableMenu.getBoundingClientRect();
      const topEdge = adminHeader.getBoundingClientRect().bottom + 8;
      const bottomEdge = window.innerHeight - 8;
      if (anchor.bottom < topEdge || anchor.top > bottomEdge) {
        closeTableMenu();
        return;
      }
      const top = anchor.bottom + rect.height <= bottomEdge ? anchor.bottom : anchor.top - rect.height;
      tableMenu.style.top = `${Math.max(topEdge,top)}px`;
      tableMenu.style.left = `${Math.max(8,Math.min(anchor.left,document.documentElement.clientWidth - rect.width - 8))}px`;
      tableGuide(tableTarget);
    }

    function tableGuide(button) {
      const guide = tableTools.querySelector('.table-guide');
      guide.hidden = !button;
      if (!button) return;
      const table = activeTable.querySelector('table');
      const column = button.dataset.axis === 'column';
      const index = Number(button.dataset.index);
      const target = (column ? table.rows[0].cells[index] : table.rows[index]).getBoundingClientRect();
      const bounds = activeTable.getBoundingClientRect();
      const origin = tableTools.getBoundingClientRect();
      const left = column ? Math.max(target.left,bounds.left) : bounds.left;
      const top = column ? bounds.top : target.top;
      guide.style.left = `${left - origin.left}px`;
      guide.style.top = `${top - origin.top}px`;
      guide.style.width = `${(column ? Math.min(target.right,bounds.right) : bounds.right) - left}px`;
      guide.style.height = `${(column ? bounds.bottom : target.bottom) - top}px`;
    }

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

    function placeCursor(node, atStart = true, preventScroll = false) {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(atStart);
      documentEditor.focus({preventScroll});
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
      imageButton.disabled = mode === 'preview' || uploading;
      documentEditor = null;
      menuBlock = null;
      activeTable = null;
      tableTarget = null;
      hoverOpened = false;
      activeRange = null;
      beforeInput = null;
      composing = false;
      if (mode === 'source') {
        canvas.innerHTML = `<label class="admin-field editor-source">Markdown 正文<textarea maxlength="180000">${escape(markdown)}</textarea></label>`;
      } else if (mode === 'preview') {
        canvas.innerHTML = `<div class="editor-preview reading">${renderMarkdown(parseMarkdown(markdown),true) || '<p class="subtle">还没有正文。</p>'}</div>`;
      } else {
        canvas.innerHTML = `<div class="document-workspace"><details class="block-menu" hidden><summary aria-label="当前块操作"><span class="block-type" aria-hidden="true">T</span><span aria-hidden="true">⋮⋮</span></summary><div class="block-options"><div class="block-type-grid" role="group" aria-label="块类型">${typeButtons}</div><p>格式</p><button type="button" data-command="bold">加粗</button><p>块操作</p><button type="button" data-action="add">在下方添加</button><button type="button" data-action="up" disabled>上移</button><button type="button" data-action="down" disabled>下移</button><button type="button" data-action="remove" disabled>删除此块</button>
          <div class="table-picker" hidden><div class="table-picker-head"><button type="button" data-table-back aria-label="返回块类型">←</button><span>插入表格</span><output></output></div><div class="table-size-grid" role="group" aria-label="选择表格行列数">
            ${Array.from({length:64},(_,i) => {
              const rows = Math.floor(i / 8) + 1;
              const columns = i % 8 + 1;
              return `<button type="button" data-rows="${rows}" data-columns="${columns}" aria-label="${rows} 行 ${columns} 列" tabindex="-1"></button>`;
            }).join('')}
          </div></div></div></details>
          <div class="document-editor reading" contenteditable="true" role="textbox" aria-label="文章正文" aria-multiline="true" spellcheck="false">${renderMarkdown(parseMarkdown(markdown)) || '<p><br></p>'}</div>
          <div class="table-tools" hidden><div class="table-guide" hidden></div><div data-rail="column" role="group" aria-label="表格列操作"></div><div data-rail="row" role="group" aria-label="表格行操作"></div></div>
          <div id="table-axis-menu" class="table-axis-menu" role="group" aria-label="表格行列操作" hidden><button type="button" data-axis-action="before"></button><button type="button" data-axis-action="after"></button><button type="button" data-axis-action="delete"></button></div>
          </div><p class="subtle editor-hint">指向正文块可打开左侧菜单，空白块也可以按 /。</p>`;
        documentEditor = canvas.querySelector('.document-editor');
        menu = canvas.querySelector('.block-menu');
        menuOptions = menu.querySelector('.block-options');
        tablePicker = menuOptions.querySelector('.table-picker');
        tableTools = canvas.querySelector('.table-tools');
        tableMenu = canvas.querySelector('.table-axis-menu');
        selectionToolbar = document.createElement('div');
        selectionToolbar.className = 'selection-toolbar';
        selectionToolbar.hidden = true;
        selectionToolbar.setAttribute('role','group');
        selectionToolbar.setAttribute('aria-label','选中文字格式');
        selectionToolbar.innerHTML = '<button type="button" data-format="bold" aria-label="加粗" title="加粗"><b>B</b></button><button type="button" data-format="italic" aria-label="斜体" title="斜体"><i>I</i></button><button type="button" data-format="strikeThrough" aria-label="删除线" title="删除线"><s>S</s></button><button type="button" data-format="code" aria-label="行内代码" title="行内代码">&lt;/&gt;</button>';
        selectionToolbar.insertAdjacentHTML('beforeend',`<button type="button" class="color-trigger" data-color-toggle aria-label="文字颜色" title="文字颜色" aria-expanded="false" aria-controls="selection-colors"><span aria-hidden="true">A</span><i aria-hidden="true"></i></button>
          <div id="selection-colors" class="color-palette" role="group" aria-label="文字配色" hidden>
            <div>字体颜色</div><div class="color-swatches">${swatches('ink',inkColors,'字体颜色')}</div>
            <div>背景颜色</div><div class="color-swatches">${swatches('highlight',highlightColors,'背景颜色')}</div>
            <button type="button" class="color-reset" data-color-reset>恢复默认</button>
          </div>`);
        colorPalette = selectionToolbar.querySelector('.color-palette');
        documentEditor.after(selectionToolbar);
        menu.addEventListener('toggle', event => {
          if (event.currentTarget !== menu) return;
          menuBlock?.classList.toggle('block-menu-target',menu.open);
          if (menu.open) {
            selectionToolbar.hidden = true;
            showColorPalette(false);
            closeTableMenu();
            positionBlockOptions();
          } else tablePicker.hidden = true;
        });
        if (savedDocument?.markdown === markdown) documentEditor.innerHTML = savedDocument.html;
        else if (savedDocument) record(savedDocument);
        savedDocument = null;
      }
    }

    function insertTableRow(table, index = table.rows.length) {
      const row = table.tBodies[0].insertRow(index - 1);
      [...table.rows[0].cells].forEach(cell => {
        const next = row.insertCell();
        if (cell.dataset.align) next.dataset.align = cell.dataset.align;
        next.append(document.createElement('br'));
      });
      return row.cells[0];
    }

    function changeTable(axis, index, action) {
      const block = activeTable;
      const table = block.querySelector('table');
      const after = action === 'after' ? 1 : 0;
      let target;
      if (axis === 'column') {
        for (const row of table.rows) {
          if (action === 'delete') row.deleteCell(index);
          else {
            const cell = document.createElement(row === table.rows[0] ? 'th' : 'td');
            if (cell.localName === 'th') cell.scope = 'col';
            cell.append(document.createElement('br'));
            row.insertBefore(cell,row.cells[index + after] || null);
          }
        }
        target = table.rows[0].cells[Math.min(index + after,table.rows[0].cells.length - 1)];
      } else if (action === 'delete' && index) {
        table.deleteRow(index);
        target = table.rows[Math.min(index,table.rows.length - 1)].cells[0];
      } else if (action === 'delete') {
        const header = table.rows[0];
        const firstRow = table.rows[1];
        [...header.cells].forEach((cell,i) => cell.replaceChildren(...firstRow.cells[i].childNodes));
        firstRow.remove();
        target = header.cells[0];
      } else if (index || after) {
        target = insertTableRow(table,index + after);
      } else {
        const header = table.rows[0];
        const firstRow = insertTableRow(table,1).parentElement;
        [...header.cells].forEach((cell,i) => {
          firstRow.cells[i].replaceChildren(...cell.childNodes);
          cell.append(document.createElement('br'));
        });
        target = header.cells[0];
      }
      closeTableMenu();
      placeCursor(target);
      positionTableTools(block,true);
    }

    function replaceBlock(block, replacement) {
      if (block.localName !== 'li') {
        block.replaceWith(replacement);
        return;
      }
      const list = block.parentElement;
      const rest = list.cloneNode(false);
      if (list.localName === 'ol') rest.start = list.start + [...list.children].indexOf(block) + 1;
      while (block.nextElementSibling) rest.append(block.nextElementSibling);
      list.after(replacement);
      if (rest.children.length) replacement.after(rest);
      block.remove();
      if (!list.children.length) list.remove();
    }

    function changeBlock(button, block) {
      hoverOpened = false;
      menu.open = false;
      if (!block) return;
      const action = button.dataset.action;
      if (action === 'remove') {
        const parent = block.parentElement;
        const container = parent === documentEditor ? block : parent;
        const next = block.nextElementSibling || container.nextElementSibling;
        const previous = block.previousElementSibling || container.previousElementSibling;
        block.remove();
        if (parent !== documentEditor && !parent.children.length) parent.remove();
        if (!documentEditor.children.length) documentEditor.innerHTML = '<p><br></p>';
        const neighbor = next || previous || documentEditor.firstElementChild;
        const cells = neighbor.querySelectorAll('th,td');
        placeCursor((next ? cells[0] : cells[cells.length - 1]) || neighbor, !previous || Boolean(next), true);
        return;
      }
      const range = activeRange?.cloneRange() || document.createRange();
      if (!block.contains(range.startContainer) || (!button.dataset.command && !block.contains(range.endContainer))) {
        range.selectNodeContents(block);
        range.collapse(true);
      }
      documentEditor.focus();
      selectRange(range);
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

      const type = button.dataset.rows ? 'table' : button.dataset.type;
      if (type === 'callout') {
        if (block.dataset.blockType !== 'callout') {
          const callout = document.createElement('div');
          callout.className = 'markdown-callout';
          callout.dataset.blockType = 'callout';
          if (block.localName === 'pre') callout.textContent = block.innerText;
          else callout.append(...block.childNodes);
          replaceBlock(block,callout);
          placeCursor(callout,false);
        }
        return;
      }
      if (block.dataset.blockType === 'callout' && type && type !== 'table' && type !== 'code') {
        const paragraph = document.createElement('p');
        paragraph.append(...block.childNodes);
        block.replaceWith(paragraph);
        placeCursor(paragraph);
        block = paragraph;
      }
      if (type === 'table') {
        const after = block.localName === 'li' ? block.parentElement : block;
        const width = Number(button.dataset.columns);
        const rows = Array.from({length:Number(button.dataset.rows)},() => Array(width).fill(''));
        after.insertAdjacentHTML('afterend',renderMarkdown([{type:'table',rows,alignment:Array(width).fill('---')}]));
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
        replaceBlock(block,pre);
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
        download(`${root.closest('form').dataset.itemId || item.id || 'itfetter-draft'}.md`,markdown,'text/markdown;charset=utf-8');
        showStatus(editorStatus,'已发起下载。','success');
      } else if (button.dataset.axis) {
        if (tableTarget === button) {
          closeTableMenu();
          return;
        }
        closeTableMenu();
        menu.open = false;
        selectionToolbar.hidden = true;
        showColorPalette(false);
        tableTarget = button;
        const row = button.dataset.axis === 'row';
        const table = activeTable.querySelector('table');
        const label = row ? '行' : '列';
        const [before,after,remove] = tableMenu.querySelectorAll('button');
        before.textContent = `在${row ? '上方' : '左侧'}插入${label}`;
        after.textContent = `在${row ? '下方' : '右侧'}插入${label}`;
        remove.textContent = `删除此${label}`;
        remove.disabled = (row ? table.rows.length : table.rows[0].cells.length) === 1;
        remove.title = remove.disabled ? `表格至少保留一${label}` : '';
        tableMenu.hidden = false;
        button.setAttribute('aria-expanded','true');
        positionTableMenu();
        if (event.detail === 0 && !tableMenu.hidden) before.focus();
      } else if (button.dataset.axisAction && tableTarget) {
        const {axis,index} = tableTarget.dataset;
        applyEdit(() => changeTable(axis,Number(index),button.dataset.axisAction));
      } else if (menu?.contains(button)) {
        const block = menuBlock;
        if (button.dataset.type === 'table') {
          hoverOpened = false;
          tablePicker.hidden = false;
          const choice = tablePicker.querySelector('[data-rows="3"][data-columns="3"]');
          paintTableSize(choice);
          positionBlockOptions();
          if (event.detail === 0) choice.focus();
          return;
        }
        if ('tableBack' in button.dataset) {
          tablePicker.hidden = true;
          positionBlockOptions();
          menuOptions.querySelector('[data-type=table]').focus();
          return;
        }
        if (button.dataset.action === 'remove') {
          const top = window.scrollY;
          if (block?.textContent.trim() &&
              !await confirmAction('删除正文块？','可以在编辑器中撤销这次删除。','删除正文块',true)) return;
          applyEdit(() => changeBlock(button,block));
          window.scrollTo({top,behavior:'instant'});
        } else applyEdit(() => changeBlock(button,block));
      } else if ('colorToggle' in button.dataset) {
        showColorPalette(colorPalette.hidden);
        if (!colorPalette.hidden && event.detail === 0) colorPalette.querySelector('button').focus();
      } else if ((button.dataset.colorKind || 'colorReset' in button.dataset) && activeRange) {
        const {colorKind,color} = button.dataset;
        const swatch = getComputedStyle(button);
        const ink = color && color !== 'default' ? swatch.color : getComputedStyle(documentEditor).color;
        const background = color && color !== 'default' ? swatch.backgroundColor : 'transparent';
        const range = activeRange.cloneRange();
        documentEditor.focus();
        selectRange(range);
        applyEdit(() => {
          document.execCommand('styleWithCSS',false,true);
          if (!colorKind || colorKind === 'ink') document.execCommand('foreColor',false,ink);
          if (!colorKind || colorKind === 'highlight') document.execCommand('hiliteColor',false,background);
          document.execCommand('styleWithCSS',false,false);
        });
        showColorPalette(false);
        positionSelectionToolbar();
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

    function insertBlocks(blocks, range) {
      const beforeRange = document.createRange();
      beforeRange.selectNodeContents(documentEditor);
      beforeRange.setEnd(range.startContainer,range.startOffset);
      const afterRange = document.createRange();
      afterRange.selectNodeContents(documentEditor);
      afterRange.setStart(range.endContainer,range.endOffset);
      const before = readDocument(beforeRange.cloneContents());
      const after = readDocument(afterRange.cloneContents());
      documentEditor.innerHTML = renderMarkdown([...before,...blocks,...after]);
      placeCursor(documentEditor.children[before.length + blocks.length - 1],false);
    }

    async function insertImages(files) {
      if (!files.length || mode === 'preview') return;
      if (uploading) {
        showStatus(editorStatus,'请等当前图片上传完成。','pending');
        return;
      }
      const target = documentEditor || canvas.querySelector('textarea');
      const range = activeRange?.cloneRange();
      const sourceValue = documentEditor ? null : target.value;
      const sourceSelection = documentEditor ? null : [target.selectionStart,target.selectionEnd];
      uploading = imageButton.disabled = true;
      showStatus(editorStatus,'正在上传图片…','pending');
      try {
        const uploads = await Promise.allSettled(files.map(uploadImage));
        if (signal.aborted) return;
        if (!target.isConnected) {
          showStatus(editorStatus,'编辑模式已切换，请重新插入图片。','error');
          return;
        }
        const blocks = uploads.filter(upload => upload.status === 'fulfilled')
          .map(({value}) => ({type:'p',text:`![正文图片](${value})`}));
        const failure = uploads.find(upload => upload.status === 'rejected');
        if (blocks.length && sourceSelection) {
          const [start,end] = target.value === sourceValue ? sourceSelection : [target.selectionStart,target.selectionEnd];
          target.setRangeText(`\n\n${markdownSource(blocks)}\n\n`,start,end,'end');
          target.dispatchEvent(new Event('input',{bubbles:true}));
        } else if (blocks.length) {
          applyEdit(() => {
            const block = blockAt(range?.startContainer);
            if (!range || !documentEditor.contains(range.commonAncestorContainer) || block?.matches('pre,.code-panel,.table-scroll,table')) {
              const next = block?.nextElementSibling;
              (block || documentEditor).insertAdjacentHTML(block ? 'afterend' : 'beforeend',renderMarkdown(blocks) + (next ? '' : '<p><br></p>'));
              placeCursor(next || documentEditor.lastElementChild);
              return;
            } else {
              insertBlocks(blocks,range);
            }
            const selection = window.getSelection();
            const inserted = blockAt(selection.anchorNode);
            if (!inserted?.matches('p') || !inserted.querySelector('img')) return;
            let next = inserted.nextElementSibling;
            if (!next) {
              inserted.insertAdjacentHTML('afterend','<p><br></p>');
              next = inserted.nextElementSibling;
            }
            placeCursor(next);
          });
        }
        const count = blocks.length;
        showStatus(editorStatus,failure
          ? `${count ? `已插入 ${count} 张。 ` : ''}${failure.reason.message}`
          : `已插入 ${count} 张图片。`,failure ? 'error' : 'success');
      } finally {
        uploading = false;
        imageButton.disabled = mode === 'preview';
      }
    }

    imageButton.onclick = () => imagePicker.click();
    imagePicker.onchange = () => {
      const files = [...imagePicker.files];
      imagePicker.value = '';
      insertImages(files);
    };

    canvas.addEventListener('paste', event => {
      if (mode !== 'preview') {
        const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
        if (files.length) {
          event.preventDefault();
          if (documentEditor) trackSelection(false);
          insertImages(files);
          return;
        }
      }
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
          insertBlocks(blocks,activeRange);
        }
      });
    });

    canvas.addEventListener('pointermove', event => {
      if (!menu || menu.open || event.pointerType === 'touch') return;
      const block = blockAt(event.target);
      if (block && block !== menuBlock) positionMenu(block);
    });
    canvas.addEventListener('pointerover', event => {
      const choice = event.target.closest('[data-rows]');
      if (choice && event.pointerType !== 'touch') paintTableSize(choice);
      const axis = event.target.closest('[data-axis]');
      if (axis && !tableTarget && !menu.open) tableGuide(axis);
      if (event.pointerType === 'touch' || !menuBlock || menu.open || !menu.contains(event.target) || !event.target.closest('summary')) return;
      trackSelection(false);
      menu.open = true;
      positionBlockOptions();
      hoverOpened = true;
    });
    canvas.addEventListener('pointerout', event => {
      if (event.target.closest('[data-axis]') && !tableTarget) tableGuide(null);
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
      if ((menu?.contains(event.target) || selectionToolbar?.contains(event.target) ||
           tableTools?.contains(event.target) || tableMenu?.contains(event.target)) && event.button === 0) {
        trackSelection(false);
        // Keep the browser's text selection while the pointer operates either toolbar.
        event.preventDefault();
      }
    });
    document.addEventListener('pointerdown',event => {
      if (tableTarget && !tableTools.contains(event.target) && !tableMenu.contains(event.target)) closeTableMenu();
    },{signal});
    for (const eventType of ['focusin','keyup','pointerup']) {
      canvas.addEventListener(eventType, event => {
        if (documentEditor?.contains(event.target)) trackSelection();
      });
    }
    root.addEventListener('keydown', event => {
      if (event.isComposing || !documentEditor) return;
      const key = event.key.toLowerCase();
      const tile = event.target.closest('[data-rows]');
      const gridMovement = {arrowup:[-1,0],arrowdown:[1,0],arrowleft:[0,-1],arrowright:[0,1]}[key];
      if (tile && gridMovement) {
        event.preventDefault();
        const row = Number(tile.dataset.rows) + gridMovement[0];
        const column = Number(tile.dataset.columns) + gridMovement[1];
        const choice = tablePicker.querySelector(`[data-rows="${row}"][data-columns="${column}"]`);
        if (choice) {
          paintTableSize(choice);
          choice.focus();
        }
        return;
      }
      if (key === 'tab' && !event.altKey && !event.ctrlKey && !event.metaKey && documentEditor.contains(event.target)) {
        const cell = cellAt(window.getSelection()?.anchorNode);
        if (cell) {
          const table = cell.closest('table');
          const cells = [...table.querySelectorAll('th,td')];
          const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
          if (next || !event.shiftKey) {
            event.preventDefault();
            if (next) placeCursor(next);
            else applyEdit(() => placeCursor(insertTableRow(table)));
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
      } else if (event.key === 'Escape' && tableTarget) {
        event.preventDefault();
        tableTarget.focus();
        closeTableMenu();
      } else if (event.key === 'Escape' && !tablePicker.hidden) {
        event.preventDefault();
        tablePicker.hidden = true;
        positionBlockOptions();
        menuOptions.querySelector('[data-type=table]').focus();
      } else if (event.key === 'Escape' && menu.open && activeRange) {
        hoverOpened = false;
        menu.open = false;
        documentEditor.focus();
        selectRange(activeRange);
      } else if (event.key === 'Escape' && !selectionToolbar.hidden) {
        event.preventDefault();
        if (!colorPalette.hidden) {
          showColorPalette(false);
          selectionToolbar.querySelector('[data-color-toggle]').focus();
        } else {
          selectionToolbar.hidden = true;
          documentEditor.focus();
        }
      } else if (event.key === 'Escape' && activeTable && documentEditor.contains(event.target)) {
        const cell = cellAt(window.getSelection()?.anchorNode);
        if (cell) {
          event.preventDefault();
          tableTools.querySelector(`[data-axis=row][data-index="${cell.parentElement.rowIndex}"]`).focus();
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
