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
      result.push({type,text:body.join('\n')});
    }
    return result;
  }

  function source(blocks) {
    return blocks.filter(block => block.text.trim()).map(({type,text,language}) => {
      if (type === 'code') return `\`\`\`${language || ''}\n${text}\n\`\`\``;
      if (/^h[1-6]$/.test(type)) return `${'#'.repeat(Number(type[1]))} ${text}`;
      if (type === 'quote' || type === 'ul' || type === 'ol') {
        return text.split('\n').map((line, i) => `${type === 'quote' ? '> ' : type === 'ul' ? '- ' : (i + 1) + '. '}${line}`).join('\n');
      }
      return text;
    }).join('\n\n');
  }

  const inline = text => escape(text).replace(/\x60([^\x60\n]+)\x60|\*\*([^*\n]+)\*\*/g, (_, code, bold) => code ? `<code>${code}</code>` : `<strong>${bold}</strong>`);

  function render(blocks, article = false) {
    let headingIndex = 0;
    return blocks.map(({type,text,language}) => {
      if (/^h[1-6]$/.test(type)) {
        const tag = `h${Math.max(2, Number(type[1]))}`;
        const attrs = article ? ` id="section-${++headingIndex}" tabindex="-1"` : '';
        return `<${tag}${attrs}>${inline(text)}</${tag}>`;
      }
      if (type === 'code') {
        const code = `<pre><code>${escape(text)}</code></pre>`;
        return article ? `<div class="code-panel"><div class="code-bar"><span class="subtle mono">${escape(language || '代码')}</span><button type="button" data-copy>复制</button></div>${code}</div>` : code;
      }
      if (type === 'ul' || type === 'ol') return `<${type}>${text.split('\n').map(line => `<li>${inline(line)}</li>`).join('')}</${type}>`;
      const tag = type === 'quote' ? 'blockquote' : 'p';
      return `<${tag}>${inline(text).replaceAll('\n','<br>')}</${tag}>`;
    }).join('');
  }

  window.blogMarkdown = {escape, blocks, source, render};
})();
