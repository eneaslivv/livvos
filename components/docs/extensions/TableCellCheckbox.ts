import TableCell from '@tiptap/extension-table-cell';

export const TableCellCheckbox = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      checked: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute('data-checked');
          if (val === null) return null;
          return val === 'true';
        },
        renderHTML: (attributes) => {
          if (attributes.checked === null || attributes.checked === undefined) return {};
          return { 'data-checked': String(attributes.checked) };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('td');
      const contentDOM = document.createElement('div');
      contentDOM.classList.add('cell-content');

      const applyAttrs = () => {
        // Copy colspan/rowspan/colwidth
        if (node.attrs.colspan > 1) dom.setAttribute('colspan', String(node.attrs.colspan));
        if (node.attrs.rowspan > 1) dom.setAttribute('rowspan', String(node.attrs.rowspan));

        const checked = node.attrs.checked;
        if (checked !== null && checked !== undefined) {
          dom.setAttribute('data-checked', String(checked));
          dom.classList.add('has-checkbox');
        } else {
          dom.removeAttribute('data-checked');
          dom.classList.remove('has-checkbox');
        }
      };
      applyAttrs();

      // Create checkbox element
      let checkbox: HTMLInputElement | null = null;

      const renderCheckbox = () => {
        const checked = node.attrs.checked;
        if (checked !== null && checked !== undefined) {
          if (!checkbox) {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('cell-checkbox');
            checkbox.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const pos = typeof getPos === 'function' ? getPos() : null;
              if (pos === null || pos === undefined) return;
              const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                checked: !node.attrs.checked,
              });
              editor.view.dispatch(tr);
            });
            dom.insertBefore(checkbox, contentDOM);
          }
          checkbox.checked = !!checked;
        } else if (checkbox) {
          checkbox.remove();
          checkbox = null;
        }
      };
      renderCheckbox();

      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          applyAttrs();
          renderCheckbox();
          return true;
        },
        destroy: () => {
          checkbox?.remove();
        },
      };
    };
  },
});
