(() => {
  const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const inkColors = {gray:['#626d7e','#bbc5d4'],red:['#bc454b','#ff9a9d'],orange:['#a95a18','#ffb380'],green:['#327641','#96d49d'],blue:['#3565bc','#abc5ff'],purple:['#8651b8','#d5b6fa']};
  const highlightColors = {gray:['#e6e9ee','#343c49'],red:['#fbd8da','#512c36'],orange:['#ffe1c0','#543825'],yellow:['#fff1a8','#48401e'],green:['#d4efcc','#274635'],blue:['#d7e5ff','#2b3d60'],purple:['#eadbff','#413151']};
  const schemeColor = colors => `light-dark(${colors.join(', ')})`;

  function colorName(value, colors) {
    value = value.match(/^light-dark\((#[\da-f]{6}|rgb\([^)]+\))/i)?.[1] || value;
    const rgb = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
    const hex = rgb ? '#' + rgb.slice(1).map(part => Number(part).toString(16).padStart(2,'0')).join('') : value.toLowerCase();
    return Object.keys(colors).find(name => colors[name].includes(hex));
  }

  function tableCells(line) {
    return line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'')
      .split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g,'|'));
  }

  function tableAt(lines, index) {
    if (!lines[index]?.includes('|') || !lines[index + 1]) return null;
    const header = tableCells(lines[index]);
    const alignment = tableCells(lines[index + 1]);
    if (alignment.length !== header.length || !alignment.every(cell => /^:?-{3,}:?$/.test(cell))) return null;
    return {type:'table',rows:[header],alignment};
  }

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
      const table = tableAt(lines,i);
      if (table) {
        i++;
        while (lines[i + 1]?.includes('|') && lines[i + 1].trim()) {
          const cells = tableCells(lines[++i]);
          table.rows.push(table.alignment.map((_,column) => cells[column] ?? ''));
        }
        result.push(table);
        continue;
      }
      const marker = line.match(/^(- |\* |\d+\. |> )(.*)$/);
      const type = marker ? ({'> ':'quote','- ':'ul','* ':'ul'})[marker[1]] || 'ol' : 'p';
      const body = [marker ? marker[2] : line];
      const pattern = {quote:/^> /,ul:/^[-*] /,ol:/^\d+\. /}[type];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (pattern ? !pattern.test(next) : !next.trim() || /^(?:```|#{1,6} |[-*] |\d+\. |> )/.test(next) || tableAt(lines,i + 1)) break;
        body.push(pattern ? next.replace(pattern,'') : next);
        i++;
      }
      if (type === 'quote' && /^\[!NOTE\]$/i.test(body[0].trim())) result.push({type:'callout',text:body.slice(1).join('\n')});
      else result.push({type,text:body.join('\n'),...(type === 'ol' ? {start:Number.parseInt(marker[1],10)} : {})});
    }
    return result;
  }

  function source(blocks) {
    return blocks.filter(block => ['table','callout'].includes(block.type) || block.text.trim()).map(({type,text,language,start = 1,rows,alignment}) => {
      if (type === 'table') {
        const row = cells => `| ${cells.map(cell => cell.replaceAll('|','\\|').replaceAll('\n','<br>')).join(' | ')} |`;
        return [row(rows[0]),row(alignment),...rows.slice(1).map(row)].join('\n');
      }
      if (type === 'code') return `\`\`\`${language || ''}\n${text}\n\`\`\``;
      if (type === 'callout') return text ? ['> [!NOTE]',...text.split('\n').map(line => `> ${line}`)].join('\n') : '> [!NOTE]';
      if (/^h[1-6]$/.test(type)) return `${'#'.repeat(Number(type[1]))} ${text}`;
      if (type === 'quote' || type === 'ul' || type === 'ol') {
        return text.split('\n').map((line, i) => `${type === 'quote' ? '> ' : type === 'ul' ? '- ' : (i + start) + '. '}${line}`).join('\n');
      }
      return text;
    }).join('\n\n');
  }

  function inline(text) {
    const tokens = [];
    const stash = html => `\uE000${tokens.push(html) - 1}\uE001`;
    const restore = value => value.replace(/\uE000(\d+)\uE001/g,(token,index) => tokens[index] ?? token);
    let escaped = escape(text).replace(/\x60([^\x60\n]+)\x60/g,(_,code) => stash(`<code>${code}</code>`));
    const span = /&lt;span(?: data-ink=&quot;([a-z]+)&quot;)?(?: data-highlight=&quot;([a-z]+)&quot;)?&gt;((?:(?!&lt;\/?span\b)[^\n])*)&lt;\/span&gt;/g;
    let previous;
    do {
      previous = escaped;
      escaped = escaped.replace(span,(match,ink,highlight,body) => {
        if ((!ink && !highlight) || (ink && !Object.hasOwn(inkColors,ink)) ||
            (highlight && !Object.hasOwn(highlightColors,highlight))) return match;
        const color = ink ? ` data-ink="${ink}"` : '';
        const marker = highlight ? ` data-highlight="${highlight}"` : '';
        const style = [ink && `color:${schemeColor(inkColors[ink])}`,highlight && `background-color:${schemeColor(highlightColors[highlight])}`].filter(Boolean).join(';');
        return stash(`<span${color}${marker} style="${style}">${restore(formatInline(body))}</span>`);
      });
    } while (escaped !== previous);
    return restore(formatInline(escaped));
  }

  function formatInline(text) {
    return text.replace(/\x60([^\x60\n]+)\x60|\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|(?<!\*)\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\*)|~~([^~\n]+)~~/g,
      (_, code, both, bold, italic, crossed) => code ? `<code>${code}</code>` : both ? `<strong><em>${formatInline(both)}</em></strong>` :
        bold ? `<strong>${formatInline(bold)}</strong>` : italic ? `<em>${formatInline(italic)}</em>` : `<del>${formatInline(crossed)}</del>`);
  }

  function fromDocument(root) {
    const result = [];
    const blockSelector = 'p,div,section,article,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table,[data-block-type]';
    const plain = node => {
      if (node.nodeType === 3) return node.textContent.replace(/[\u200B\uFEFF]/g,'');
      if (node.nodeType !== 1 || node.matches('script,style,button,[hidden]')) return '';
      if (node.matches('br')) return '\n';
      return [...node.childNodes].map(plain).join('');
    };
    const formatted = node => {
      if (node.nodeType !== 1 || node.matches('br,script,style,button,[hidden]')) return plain(node);
      let text = [...node.childNodes].map(formatted).join('');
      if (!text.trim()) return text;
      if (node.matches('code,[data-inline-code]')) text = `\x60${plain(node)}\x60`;
      else {
        const bold = node.matches('b,strong') || /^(bold|[6-9]00)$/.test(node.style.fontWeight);
        const italic = node.matches('i,em') || node.style.fontStyle === 'italic';
        const emphasis = bold && italic ? '***' : bold ? '**' : italic ? '*' : '';
        if (emphasis) text = `${emphasis}${text}${emphasis}`;
        if (node.matches('s,strike,del') || node.style.textDecorationLine.includes('line-through')) text = `~~${text}~~`;
      }
      const ink = colorName(node.style.color || node.getAttribute('color') || '',inkColors);
      const highlight = colorName(node.style.backgroundColor,highlightColors);
      if (ink || highlight) {
        const attrs = (ink ? ` data-ink="${ink}"` : '') + (highlight ? ` data-highlight="${highlight}"` : '');
        text = text.split('\n').map(line => line.trim() ? `<span${attrs}>${line}</span>` : line).join('\n');
      }
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
        if (tag === 'table' || kind === 'table' && node.querySelector('table')) {
          const table = tag === 'table' ? node : node.querySelector('table');
          const rows = [...table.rows].map(row => [...row.cells].flatMap(cell => [formatted(cell).trim(),...Array(cell.colSpan - 1).fill('')]));
          const width = Math.max(0,...rows.map(row => row.length));
          if (width) {
            rows.forEach(row => { while (row.length < width) row.push(''); });
            const alignment = rows[0].map((_,i) => {
              const cell = table.rows[0].cells[i];
              return ({left:':---',center:':---:',right:'---:'})[cell?.dataset.align || cell?.style.textAlign] || '---';
            });
            result.push({type:'table',rows,alignment});
          }
        } else if (heading || /^h[1-6]$/.test(tag)) {
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
        } else if (kind === 'callout') {
          const text = [...node.childNodes].map(child => (child.matches?.('div,p') && child.previousSibling ? '\n' : '') + formatted(child)).join('');
          result.push({type:'callout',text:text.trim()});
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

  function render(blocks, article = false, copyCode = article) {
    let headingIndex = 0;
    return blocks.map(({type,text,language,start = 1,rows,alignment}) => {
      if (type === 'table') {
        const cells = (row, tag) => row.map((cell,i) => {
          const align = ({':---':'left',':---:':'center','---:':'right'})[alignment[i].replace(/-{3,}/,'---')];
          return `<${tag}${tag === 'th' ? ' scope="col"' : ''}${align ? ` data-align="${align}"` : ''}>${inline(cell).replaceAll('&lt;br&gt;','<br>') || '<br>'}</${tag}>`;
        }).join('');
        return `<div class="table-scroll" data-block-type="table"${copyCode ? ' tabindex="0"' : ''}><table><thead><tr>${cells(rows[0],'th')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${cells(row,'td')}</tr>`).join('')}</tbody></table></div>`;
      }
      if (/^h[1-6]$/.test(type)) {
        const tag = `h${article ? Math.max(2,Number(type[1])) : type[1]}`;
        const attrs = article ? ` id="section-${++headingIndex}" tabindex="-1"` : '';
        return `<${tag}${attrs}>${inline(text)}</${tag}>`;
      }
      if (type === 'code') {
        const code = `<pre${language ? ` data-language="${escape(language)}"` : ''}><code>${escape(text)}</code></pre>`;
        return copyCode ? `<div class="code-panel"><div class="code-bar"><span class="subtle mono">${escape(language || '代码')}</span><button type="button" data-copy>复制</button></div>${code}</div>` : code;
      }
      if (type === 'ul' || type === 'ol') return `<${type}${type === 'ol' && start !== 1 ? ` start="${start}"` : ''}>${text.split('\n').map(line => `<li>${inline(line)}</li>`).join('')}</${type}>`;
      if (type === 'callout') return `<div class="markdown-callout" data-block-type="callout">${inline(text).replaceAll('\n','<br>') || '<br>'}</div>`;
      const tag = type === 'quote' ? 'blockquote' : 'p';
      return `<${tag}>${inline(text).replaceAll('\n','<br>')}</${tag}>`;
    }).join('');
  }

  function coverImage({cover, coverAlt}) {
    if (!/^(?:https?:\/\/|assets\/)/i.test(cover || '')) return '';
    return `<img class="cover-image" src="${escape(cover)}" alt="${escape(coverAlt || '')}" width="900" height="600" decoding="async">`;
  }

  window.addEventListener('error', event => {
    if (event.target.matches?.('img.cover-image')) event.target.hidden = true;
  }, true);

  window.blogMarkdown = {escape, blocks, source, render, fromDocument, clipboardBlocks, coverImage, inkColors, highlightColors, schemeColor};
})();
