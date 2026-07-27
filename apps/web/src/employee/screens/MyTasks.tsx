import { useEffect, useMemo, useState } from 'react';
import {
  employeeApi,
  type DirectoryEntry,
  type TaskView,
} from '../api';
import { EMP, RADIUS, fmtDate } from '../theme';
import { Button, Card, ErrorNote, Field, Input, Select, label } from '../ui';
import { Icon } from '../../components/Icon';

// The "My tasks" card, built to the design's spec: a header carrying the open
// count, then rows of a checkbox, a title, and a due date. Completed rows go
// grey and struck through and sink to the bottom rather than disappearing, so
// ticking one off never feels like it deleted something.
//
// Everything here is the signed-in person's own. A portal admin can *assign*
// work from the control at the bottom, but there is no view of what anyone else
// has or has not done — that would be a different feature, and a more loaded one.

export function MyTasks({ canAssign }: { canAssign: boolean }) {
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    employeeApi
      .tasks()
      .then((r) => setTasks(r.tasks))
      .catch((e) => setError((e as Error).message));
  }, []);

  const openCount = useMemo(() => (tasks ?? []).filter((t) => !t.doneAt).length, [tasks]);

  async function toggle(task: TaskView) {
    // Optimistic: the checkbox should respond immediately, and the server call
    // is a single boolean that either lands or doesn't.
    const before = tasks;
    setTasks((prev) =>
      (prev ?? []).map((t) => (t.id === task.id ? { ...t, doneAt: task.doneAt ? null : Date.now() } : t)),
    );
    try {
      const r = await employeeApi.setTaskDone(task.id, !task.doneAt);
      setTasks(r.tasks);
    } catch (e) {
      setTasks(before);
      setError((e as Error).message);
    }
  }

  async function remove(task: TaskView) {
    try {
      const r = await employeeApi.deleteTask(task.id);
      setTasks(r.tasks);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card pad={0}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: `1px solid ${EMP.lineSoft}`,
        }}
      >
        <span style={{ fontFamily: EMP.serif, fontSize: 17, fontWeight: 700, color: EMP.text }}>
          {"My tasks"}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: EMP.faint }}>
          {/* A live figure, so never editable copy — but the word beside it is. */}
          {openCount} {"open"}
        </span>
      </div>

      {error && (
        <div style={{ padding: '12px 16px 0' }}>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {!tasks ? (
        <div style={{ padding: '22px 16px', fontSize: 13, color: EMP.muted, textAlign: 'center' }}>
          {"Loading…"}
        </div>
      ) : tasks.length === 0 ? (
        <div
          style={{
            margin: 16,
            border: `1px solid ${EMP.lineSoft}`,
            background: EMP.panel2,
            borderRadius: RADIUS.card,
            padding: 22,
            textAlign: 'center',
            fontSize: 13,
            color: EMP.muted,
            lineHeight: 1.6,
          }}
        >
          {"Nothing on your list. Add something you need to remember, like renewing a certification."}
        </div>
      ) : (
        <div>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} onRemove={() => remove(task)} />
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          padding: '12px 16px 14px',
          borderTop: `1px solid ${EMP.lineSoft}`,
        }}
      >
        <Button onClick={() => setAdding((v) => !v)}>
          <Icon name="plus" size={13} />
          {adding ? "Cancel" : "Add a task"}
        </Button>
        {canAssign && <AssignTask onAssigned={(next) => setTasks(next)} />}
      </div>

      {adding && (
        <AddTask
          onDone={(next) => {
            setTasks(next);
            setAdding(false);
          }}
        />
      )}
    </Card>
  );
}

function TaskRow({
  task,
  onToggle,
  onRemove,
}: {
  task: TaskView;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  const done = !!task.doneAt;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '12px 16px',
        borderTop: `1px solid ${EMP.lineSoft}`,
        background: hover ? EMP.panel2 : 'transparent',
      }}
    >
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        style={{
          width: 17,
          height: 17,
          flex: 'none',
          marginTop: 1,
          borderRadius: RADIUS.tag,
          border: done ? `1px solid ${EMP.green}` : '1px solid #c3ccc8',
          background: done ? EMP.green : EMP.panel,
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {done && <Icon name="check" size={11} />}
      </button>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: done ? 400 : 600,
            color: done ? EMP.faint : EMP.text,
            textDecoration: done ? 'line-through' : 'none',
            lineHeight: 1.45,
          }}
        >
          {task.title}
        </div>
        {task.detail && (
          <div style={{ fontSize: 12, color: EMP.muted, marginTop: 3, lineHeight: 1.5 }}>
            {task.detail}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: EMP.faint, marginTop: 4 }}>
          {task.dueOn ? (
            <>
              {"Due"} {fmtDate(task.dueOn)}
            </>
          ) : (
            "No due date"
          )}
          {task.assigned && task.assignedByName ? ` · ${task.assignedByName}` : ''}
        </div>
      </div>

      <button
        onClick={onRemove}
        aria-label={`Remove "${task.title}"`}
        title="Remove"
        style={{
          flex: 'none',
          background: 'none',
          border: 'none',
          color: hover ? EMP.faint : 'transparent',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
        }}
      >
        <Icon name="trash-2" size={13} />
      </button>
    </div>
  );
}

function AddTask({ onDone }: { onDone: (tasks: TaskView[]) => void }) {
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const placeholder = 'What do you need to remember?';

  async function save() {
    if (busy) return;
    if (!title.trim()) {
      setError('Give the task a title');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await employeeApi.addTask({ title: title.trim(), dueOn: dueOn.trim() || null });
      onDone(r.tasks);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: '0 16px 16px', display: 'grid', gap: 11 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 11 }}>
        <Field label={"Task"}>
          <Input value={title} onChange={setTitle} maxLength={200} placeholder={placeholder} autoFocus />
        </Field>
        <Field label={"Due date"} hint="YYYY-MM-DD">
          <Input value={dueOn} onChange={setDueOn} maxLength={10} placeholder="2026-08-01" />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div>
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Adding…" : "Add task"}
        </Button>
      </div>
    </div>
  );
}

// Portal admins only: put a task on one person's list, or on everyone's. When
// "everyone" is chosen the server writes one row per person, so each employee
// completes their own copy independently.
function AssignTask({ onAssigned }: { onAssigned: (tasks: TaskView[]) => void }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<DirectoryEntry[]>([]);
  const [target, setTarget] = useState('everyone');
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || people.length) return;
    employeeApi
      .directory()
      .then((r) => setPeople(r.people))
      .catch(() => {});
  }, [open, people.length]);

  async function assign() {
    if (busy) return;
    if (!title.trim()) {
      setError('Give the task a title');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await employeeApi.assignTask({
        title: title.trim(),
        dueOn: dueOn.trim() || null,
        ...(target === 'everyone' ? { everyone: true } : { userId: target }),
      });
      onAssigned(r.tasks);
      setTitle('');
      setDueOn('');
      setNote(
        target === 'everyone'
          ? `Added to ${r.assigned} ${r.assigned === 1 ? 'person’s' : 'people’s'} list.`
          : 'Added to their list.',
      );
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        <Button onClick={() => setOpen(true)}>
          <Icon name="user-plus" size={13} />
          {"Assign to someone"}
        </Button>
        {note && <span style={{ fontSize: 12, color: EMP.green, alignSelf: 'center' }}>{note}</span>}
      </>
    );
  }

  return (
    <div style={{ width: '100%', display: 'grid', gap: 11 }}>
      <div style={{ ...label }}>
        {"Assign a task"}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 11 }}>
        <Field label={"Who"}>
          <Select
            value={target}
            onChange={setTarget}
            options={[
              { value: 'everyone', label: 'Everyone' },
              ...people.map((p) => ({ value: p.userId, label: p.name })),
            ]}
          />
        </Field>
        <Field label={"Task"}>
          <Input value={title} onChange={setTitle} maxLength={200} />
        </Field>
        <Field label={"Due date"} hint="YYYY-MM-DD">
          <Input value={dueOn} onChange={setDueOn} maxLength={10} placeholder="2026-08-01" />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={assign} disabled={busy}>
          {busy ? "Assigning…" : "Assign"}
        </Button>
        <Button onClick={() => setOpen(false)}>
          {"Cancel"}
        </Button>
      </div>
    </div>
  );
}
