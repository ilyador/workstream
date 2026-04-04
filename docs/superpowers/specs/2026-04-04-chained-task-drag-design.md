# Chained Task Drag & Drop

## Context

Tasks connected by file artifacts (producer → connector → consumer) must move as a single unit. You cannot drop anything between chained tasks, and dragging any task in the chain drags the entire group.

## Chain Detection

A chain is a sequence of consecutive tasks where:
- Task A has `chaining = 'produce'` or `'both'`
- Task B (next by position) has `chaining = 'accept'` or `'both'`
- If B also produces and C accepts, the chain extends to 3+

Detection happens in `WorkstreamColumn.tsx` during the task render loop. Build an array of chain groups: `Array<{ taskIds: string[], startIndex: number }>`.

## DOM Structure

Wrap chained tasks in a `.chainGroup` div:

```html
<div class="chainGroup" data-group-ids="id1,id2">
  <div class="cardWrap" data-task-id="id1">
    <TaskCard ... />
  </div>
  <ArtifactConnector taskId="id1" />
  <div class="cardWrap" data-task-id="id2">
    <TaskCard ... />
  </div>
</div>
```

Unchained tasks render as before (bare `.cardWrap`).

## Visual — Normal State

The `.chainGroup` has a subtle border:
```css
.chainGroup {
  border: 1.5px solid rgba(45,111,191,0.12);
  border-radius: 10px;
  padding: 4px;
  background: rgba(45,111,191,0.02);
}
```

## Visual — Dragging State

When any task in the chain is grabbed:
- ALL cards in the group get `isDragging` (opacity 0.25, dashed border)
- The group border stays visible
- Drag ghost: clone the entire `.chainGroup` div as the drag preview

## Drag Initiation

Store `draggedGroupIds: string[]` (not just one ID). When a drag starts on a task that's in a chain, set `draggedGroupIds` to all task IDs in that chain.

The drag handle works on any task in the chain — all behave identically.

## Drop Calculation — `updateDropIndicator`

1. Query all `.cardWrap` elements
2. Filter out ALL wraps whose `data-task-id` is in `draggedGroupIds`
3. Also skip wraps inside a `.chainGroup` — treat each `.chainGroup` as a single element by using its bounding rect instead of individual card rects
4. Find the drop position by comparing cursor Y against the midpoints of: individual cards (unchained) and chain groups (as single rects)
5. `dropBeforeTaskId` = the first task ID of the element/group that the cursor is above

## No-Drop Zone

When the cursor is over a chain group (that isn't the dragged group), the drop indicator appears at the group boundaries only:
- Above the group: `dropBefore` on the first card in the group
- Below the group: `dropAfter` on the last card in the group
- Never between internal cards

## Position Update

When dropping a chained group:
1. Calculate `newPosition` for the first task (same as single-task logic)
2. Set subsequent tasks in the chain to `newPosition + 0.001 * i` to maintain internal order
3. `handleDropTask` in Board.tsx receives the first task's ID and moves all group members

## Board.tsx Changes

- `handleDropTask` checks if the dropped task is part of a chain
- If so, moves all tasks in the chain with sequential positions
- `onMoveTask` is called once per task in the chain

## Files to Change

| File | Changes |
|------|---------|
| `WorkstreamColumn.tsx` | Chain detection, `.chainGroup` wrapper, group drag state, updated `updateDropIndicator` |
| `WorkstreamColumn.module.css` | `.chainGroup` styles, `.chainGroupDragging` |
| `Board.tsx` | `draggedGroupIds` state, group-aware `handleDropTask` |
| `TaskCard.tsx` | Accept `groupDragging` prop for chain-wide isDragging |

## Verification

1. Create two tasks: A (produce) → B (accept). They render in a blue-bordered group.
2. Drag A's handle — both A and B fade, drag ghost shows both cards.
3. Drop above another task — both A and B move together, maintaining order.
4. Try to drop a third task between A and B — no drop indicator appears there.
5. Three-task chain (A produce → B both → C accept) — all three move as a unit.
6. Unchained tasks still drag normally.
