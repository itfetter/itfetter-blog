(() => {
  const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

  function blocks(markdown) {
    const result = [];
    const lines = markdown.replaceAll('\r\n', '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const fence = line.match(/^```\s*([^`]*)$/);
      if (fence) {
        const body = [];
        while (++i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i]);
        result.push({type:'code', text:body.join('\n'), language:fence[1].trim()});
        continue;
      }
      const heading = line.match(/^(#{1,6}) (.+)$/);
      if (heading) {
        result.push({type:`h${heading[1].length}`, text:heading[2]});
        continue;
      }
      const marker = line.match(/^(- |\* |\d+\. |> )(.*)$/);
      const type = marker ? ({'> ':'quote','- ':'ul','* ':'ul'})[marker[1]] || 'ol' : 'p';
      const body = [marker ? marker[2] : line];
      const pattern = {quote:/^> /,ul:/^[-*] /,ol:/^\d+\. /}[type];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (pattern ? !pattern.test(next) : !next.trim() || /^(?:```|#{1,6} |[-*] |\d+\. |> )/.test(next)) break;
        body.push(pattern ? next.replace(pattern,'') : next);
        i++;
      }
      result.push({type,text:body.join('\n'),...(type === 'ol' ? {start:Number.parseInt(marker[1],10)} : {})});
    }
    return result;
  }

  function source(blocks) {
    return blocks.filter(block => block.text.trim()).map(({type,text,language,start = 1}) => {
      if (type === 'code') return `\`\`\`${language || ''}\n${text}\n\`\`\``;
      if (/^h[1-6]$/.test(type)) return `${'#'.repeat(Number(type[1]))} ${text}`;
      if (type === 'quote' || type === 'ul' || type === 'ol') {
        return text.split('\n').map((line, i) => `${type === 'quote' ? '> ' : type === 'ul' ? '- ' : (i + start) + '. '}${line}`).join('\n');
      }
      return text;
    }).join('\n\n');
  }

  const inline = text => escape(text).replace(/\x60([^\x60\n]+)\x60|\*\*([^*\n]+)\*\*/g, (_, code, bold) => code ? `<code>${code}</code>` : `<strong>${bold}</strong>`);

  function fromDocument(root) {
    const result = [];
    const blockSelector = 'p,div,section,article,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,[data-block-type]';
    const plain = node => {
      if (node.nodeType === 3) return node.textContent.replace(/[\u200B\uFEFF]/g,'');
      if (node.nodeType !== 1 || node.matches('script,style,button,[hidden]')) return '';
      if (node.matches('br')) return '\n';
      return [...node.childNodes].map(plain).join('');
    };
    const formatted = node => {
      if (node.nodeType !== 1 || node.matches('br,script,style,button,[hidden]')) return plain(node);
      const text = [...node.childNodes].map(formatted).join('');
      if (!text.trim()) return text;
      if (node.matches('code,[data-inline-code]')) return `\x60${plain(node)}\x60`;
      if (node.matches('b,strong') || /^(bold|[6-9]00)$/.test(node.style.fontWeight)) return `**${text}**`;
      return text;
    };
    function append(type, text, language, adjacent = false, start = 1) {
      text = type === 'code' ? text.replace(/\n$/,'') : text.trim();
      if (!text.trim()) return;
      const previous = result.at(-1);
      if (adjacent && previous?.type === type) previous.text += '\n' + text;
      else result.push({type,text,language,...(type === 'ol' ? {start} : {})});
    }
    function visit(parent) {
      let run = '';
      for (const node of parent.childNodes) {
        if (node.nodeType !== 1 || (!node.matches(blockSelector) && !node.querySelector(blockSelector))) {
          run += formatted(node);
          continue;
        }
        append('p',run);
        run = '';
        const tag = node.localName;
        const kind = node.dataset.blockType;
        const heading = kind?.match(/^heading([1-6])$/);
        if (node.matches('script,style,[hidden]') || kind === 'image') continue;
        if (heading || /^h[1-6]$/.test(tag)) {
          const inner = node.querySelector('.text-editor') || node;
          append(heading ? `h${heading[1]}` : tag,formatted(inner));
        } else if (tag === 'pre' || kind === 'code') {
          const code = node.querySelector('pre,code,.code-content,.text-editor') || node;
          const lines = [...code.querySelectorAll('.ace-line')];
          const language = node.dataset.language || code.className.match?.(/(?:^|\s)language-([\w+-]+)/)?.[1] || '';
          append('code', lines.length ? lines.map(plain).join('\n') : plain(code),language);
        } else if (tag === 'ul' || tag === 'ol') {
          append(tag,[...node.children].filter(child => child.localName === 'li').map(formatted).join('\n'),undefined,false,node.start);
        } else if (kind === 'ordered' || kind === 'bullet' || kind === 'unordered' || tag === 'li') {
          append(kind === 'ordered' ? 'ol' : 'ul',formatted(node.querySelector('.text-editor') || node),undefined,true);
        } else if (tag === 'blockquote' || kind === 'quote') {
          append('quote',formatted(node.querySelector('.text-editor') || node));
        } else if (kind === 'text' || tag === 'p') {
          append('p',formatted(node.querySelector('.text-editor') || node));
        } else {
          visit(node);
        }
      }
      append('p',run);
    }
    visit(root);
    return result;
  }

  function clipboardBlocks(html, plainText) {
    if (html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const rich = fromDocument(template.content);
      if (rich.length > 1 || (rich.length === 1 && rich[0].type !== 'p')) return rich;
      if (rich.length && !plainText.includes('\n')) return rich;
    }
    return blocks(plainText.replace(/(^|\n)(\d+\.)[ \t]*\n[ \t]*(?=\S)/g,'$1$2 ')).flatMap(block =>
      block.type === 'p' ? block.text.split('\n').filter(line => line.trim()).map(text => ({type:'p',text})) : [block]);
  }

  function render(blocks, article = false) {
    let headingIndex = 0;
    return blocks.map(({type,text,language,start = 1}) => {
      if (/^h[1-6]$/.test(type)) {
        const tag = `h${article ? Math.max(2,Number(type[1])) : type[1]}`;
        const attrs = article ? ` id="section-${++headingIndex}" tabindex="-1"` : '';
        return `<${tag}${attrs}>${inline(text)}</${tag}>`;
      }
      if (type === 'code') {
        const code = `<pre${language ? ` data-language="${escape(language)}"` : ''}><code>${escape(text)}</code></pre>`;
        return article ? `<div class="code-panel"><div class="code-bar"><span class="subtle mono">${escape(language || '代码')}</span><button type="button" data-copy>复制</button></div>${code}</div>` : code;
      }
      if (type === 'ul' || type === 'ol') return `<${type}${type === 'ol' && start !== 1 ? ` start="${start}"` : ''}>${text.split('\n').map(line => `<li>${inline(line)}</li>`).join('')}</${type}>`;
      const tag = type === 'quote' ? 'blockquote' : 'p';
      return `<${tag}>${inline(text).replaceAll('\n','<br>')}</${tag}>`;
    }).join('');
  }

  window.blogMarkdown = {escape, blocks, source, render, fromDocument, clipboardBlocks};
})();
