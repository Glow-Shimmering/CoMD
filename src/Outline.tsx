import { useId, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

type Heading = { level: number; text: string; line: number };
type OutlineNode = Heading & { key: string; children: OutlineNode[] };
type BranchState = { collapsed: ReadonlySet<string>; onToggle(key: string): void; onJump(line: number): void };

function buildTree(headings: Heading[]): OutlineNode[] {
  const root = { level: 0, key: '', children: [] as OutlineNode[], occurrences: new Map<string, number>() };
  const stack = [root];
  for (const heading of headings) {
    while (stack.length > 1 && stack.at(-1)!.level >= heading.level) stack.pop();
    const parent = stack.at(-1)!;
    const identity = JSON.stringify([heading.level, heading.text]);
    const occurrence = parent.occurrences.get(identity) ?? 0;
    parent.occurrences.set(identity, occurrence + 1);
    // Body edits can move a heading to another line without resetting its fold state.
    // Repeated heading names remain independent within their parent section.
    const node = { ...heading, key: `${parent.key}/${JSON.stringify([identity, occurrence])}`, children: [] as OutlineNode[] };
    parent.children.push(node);
    stack.push({ ...node, occurrences: new Map<string, number>() });
  }
  return root.children;
}

function Branch({ node, collapsed, onToggle, onJump }: BranchState & { node: OutlineNode }) {
  const childrenId = useId();
  const hasChildren = node.children.length > 0;
  const expanded = !collapsed.has(node.key);
  const toggleLabel = `${expanded ? '收起' : '展开'} ${node.text || '未命名标题'} 的下级标题`;
  return <li>
    <div className="outline-row">
      {hasChildren ? <button type="button" className="outline-toggle" aria-label={toggleLabel} title={toggleLabel}
        aria-expanded={expanded} aria-controls={childrenId} onClick={() => onToggle(node.key)}>
        <ChevronRight size={13} aria-hidden="true"/>
      </button> : <span className="outline-spacer" aria-hidden="true"/>}
      <button type="button" className="outline-item" title={node.text} onClick={() => onJump(node.line)}>
        <span className="outline-level" aria-hidden="true">H{node.level}</span>
        <span className="outline-text">{node.text || '未命名标题'}</span>
      </button>
    </div>
    {hasChildren && <ul id={childrenId} hidden={!expanded}>
      {node.children.map(child => <Branch key={child.key} node={child} collapsed={collapsed} onToggle={onToggle} onJump={onJump}/>)}
    </ul>}
  </li>;
}

export default function Outline({ headings, ...state }: BranchState & { headings: Heading[] }) {
  const tree = useMemo(() => buildTree(headings), [headings]);
  return <nav aria-label="文档大纲"><ul className="outline-tree">
    {tree.map(node => <Branch key={node.key} node={node} {...state}/>)}
  </ul></nav>;
}
