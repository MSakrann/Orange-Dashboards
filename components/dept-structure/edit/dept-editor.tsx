"use client";

import Link from "next/link";
import { useState } from "react";
import type { DeptStructure } from "@/data/dept-structure";
import { createClient } from "@/lib/supabase/client";
import {
  createDeptMember,
  createDeptTeam,
  deleteDeptMember,
  deleteDeptTeam,
  DeptMutationError,
  updateDeptMember,
  updateDeptProfile,
  updateDeptTeam,
} from "@/lib/data/dept-structure-mutations";
import { loadDeptStructure } from "@/lib/data/dept-structure";

export function DeptEditor({ initial }: { initial: DeptStructure }) {
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const supabase = createClient();
    setData(await loadDeptStructure(supabase));
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (caught) {
      setError(caught instanceof DeptMutationError ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dept-edit-page">
      <header className="dept-edit-header">
        <div>
          <h1>Edit department structure</h1>
          <p>Admins only. Changes appear on the public portfolio after save.</p>
        </div>
        <Link href="/dept-structure">View portfolio</Link>
      </header>

      {notice ? <p className="mutation-notice" role="status">{notice}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <ProfileSection
        data={data}
        busy={busy}
        onSave={(input) =>
          run(async () => {
            await updateDeptProfile(createClient(), data.profile.id, input);
          }, "Profile saved.")
        }
      />

      <TeamsSection
        data={data}
        busy={busy}
        onCreateTeam={(input) =>
          run(async () => {
            await createDeptTeam(createClient(), input);
          }, "Team created.")
        }
        onUpdateTeam={(id, input) =>
          run(async () => {
            await updateDeptTeam(createClient(), id, input);
          }, "Team updated.")
        }
        onDeleteTeam={(id) =>
          run(async () => {
            await deleteDeptTeam(createClient(), id);
          }, "Team deleted.")
        }
        onCreateMember={(teamId, input) =>
          run(async () => {
            await createDeptMember(createClient(), teamId, input);
          }, "Member added.")
        }
        onUpdateMember={(id, input) =>
          run(async () => {
            await updateDeptMember(createClient(), id, input);
          }, "Member updated.")
        }
        onDeleteMember={(id) =>
          run(async () => {
            await deleteDeptMember(createClient(), id);
          }, "Member deleted.")
        }
      />
    </main>
  );
}

function ProfileSection({
  data,
  busy,
  onSave,
}: {
  data: DeptStructure;
  busy: boolean;
  onSave: (input: {
    brandName: string;
    heroHeadline: string;
    heroSupport: string;
    mission: string;
    departmentHeadName: string;
    departmentHeadTitle: string;
    statTeams: number;
    statMembers: number;
    statActiveProjects: number;
    statOnTrackPct: number;
  }) => void;
}) {
  const [form, setForm] = useState({
    brandName: data.profile.brandName,
    heroHeadline: data.profile.heroHeadline,
    heroSupport: data.profile.heroSupport,
    mission: data.profile.mission,
    departmentHeadName: data.profile.departmentHeadName,
    departmentHeadTitle: data.profile.departmentHeadTitle,
    statTeams: data.profile.statTeams,
    statMembers: data.profile.statMembers,
    statActiveProjects: data.profile.statActiveProjects,
    statOnTrackPct: data.profile.statOnTrackPct,
  });

  return (
    <section className="dept-edit-section">
      <h2>Profile & glance</h2>
      <div className="dept-edit-grid">
        <Field label="Brand name" value={form.brandName} onChange={(v) => setForm({ ...form, brandName: v })} />
        <Field label="Headline" value={form.heroHeadline} onChange={(v) => setForm({ ...form, heroHeadline: v })} />
        <Field className="full" label="Support line" value={form.heroSupport} onChange={(v) => setForm({ ...form, heroSupport: v })} />
        <TextArea className="full" label="Mission" value={form.mission} onChange={(v) => setForm({ ...form, mission: v })} />
        <Field label="Department head" value={form.departmentHeadName} onChange={(v) => setForm({ ...form, departmentHeadName: v })} />
        <Field label="Head title" value={form.departmentHeadTitle} onChange={(v) => setForm({ ...form, departmentHeadTitle: v })} />
        <NumberField label="Functions stat" value={form.statTeams} onChange={(v) => setForm({ ...form, statTeams: v })} />
        <NumberField label="Members stat" value={form.statMembers} onChange={(v) => setForm({ ...form, statMembers: v })} />
        <NumberField label="Active projects stat" value={form.statActiveProjects} onChange={(v) => setForm({ ...form, statActiveProjects: v })} />
      </div>
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => onSave(form)}>
          Save profile
        </button>
      </div>
    </section>
  );
}

function TeamsSection({
  data,
  busy,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
}: {
  data: DeptStructure;
  busy: boolean;
  onCreateTeam: (input: { name: string; leadName: string; focus: string; goal: string; scope: string; activitySummary: string; sortOrder: number }) => void;
  onUpdateTeam: (id: string, input: { name: string; leadName: string; focus: string; goal: string; scope: string; activitySummary: string; sortOrder: number }) => void;
  onDeleteTeam: (id: string) => void;
  onCreateMember: (teamId: string, input: { name: string; role: string; sortOrder: number }) => void;
  onUpdateMember: (id: string, input: { name: string; role: string; sortOrder: number }) => void;
  onDeleteMember: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    leadName: "",
    focus: "",
    goal: "",
    scope: "",
    activitySummary: "",
    sortOrder: data.teams.length,
  });

  return (
    <section className="dept-edit-section">
      <h2>Teams ({data.teams.length}/6)</h2>
      {data.teams.map((team) => (
        <TeamEditor
          key={team.id}
          team={team}
          busy={busy}
          onSave={(input) => onUpdateTeam(team.id, input)}
          onDelete={() => onDeleteTeam(team.id)}
          onCreateMember={(input) => onCreateMember(team.id, input)}
          onUpdateMember={onUpdateMember}
          onDeleteMember={onDeleteMember}
        />
      ))}

      {data.teams.length < 6 ? (
        <div className="dept-edit-entity">
          <h3>Add team</h3>
          <div className="dept-edit-grid">
            <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Lead" value={draft.leadName} onChange={(v) => setDraft({ ...draft, leadName: v })} />
            <Field className="full" label="Focus" value={draft.focus} onChange={(v) => setDraft({ ...draft, focus: v })} />
            <Field className="full" label="Goal" value={draft.goal} onChange={(v) => setDraft({ ...draft, goal: v })} />
            <Field className="full" label="Scope" value={draft.scope} onChange={(v) => setDraft({ ...draft, scope: v })} />
            <Field className="full" label="Activity summary" value={draft.activitySummary} onChange={(v) => setDraft({ ...draft, activitySummary: v })} />
            <NumberField label="Sort order" value={draft.sortOrder} onChange={(v) => setDraft({ ...draft, sortOrder: v })} />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => {
                onCreateTeam(draft);
                setDraft({ name: "", leadName: "", focus: "", goal: "", scope: "", activitySummary: "", sortOrder: data.teams.length + 1 });
              }}
            >
              Add team
            </button>
          </div>
        </div>
      ) : (
        <p className="dept-empty">Maximum of 6 teams reached.</p>
      )}
    </section>
  );
}

function TeamEditor({
  team,
  busy,
  onSave,
  onDelete,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
}: {
  team: DeptStructure["teams"][number];
  busy: boolean;
  onSave: (input: { name: string; leadName: string; focus: string; goal: string; scope: string; activitySummary: string; sortOrder: number }) => void;
  onDelete: () => void;
  onCreateMember: (input: { name: string; role: string; sortOrder: number }) => void;
  onUpdateMember: (id: string, input: { name: string; role: string; sortOrder: number }) => void;
  onDeleteMember: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: team.name,
    leadName: team.leadName,
    focus: team.focus,
    goal: team.goal,
    scope: team.scope,
    activitySummary: team.activitySummary,
    sortOrder: team.sortOrder,
  });
  const [memberDraft, setMemberDraft] = useState({ name: "", role: "", sortOrder: team.members.length });

  return (
    <div className="dept-edit-entity">
      <h3>{team.name}</h3>
      <div className="dept-edit-grid">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Lead" value={form.leadName} onChange={(v) => setForm({ ...form, leadName: v })} />
        <Field className="full" label="Focus" value={form.focus} onChange={(v) => setForm({ ...form, focus: v })} />
        <Field className="full" label="Goal" value={form.goal} onChange={(v) => setForm({ ...form, goal: v })} />
        <Field className="full" label="Scope" value={form.scope} onChange={(v) => setForm({ ...form, scope: v })} />
        <Field className="full" label="Activity summary" value={form.activitySummary} onChange={(v) => setForm({ ...form, activitySummary: v })} />
        <NumberField label="Sort order" value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })} />
      </div>
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => onSave(form)}>
          Save team
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onDelete}>
          Delete team
        </button>
      </div>

      <div className="dept-edit-nested">
        <h3>Members</h3>
        {team.members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            busy={busy}
            onSave={(input) => onUpdateMember(member.id, input)}
            onDelete={() => onDeleteMember(member.id)}
          />
        ))}
        <div className="dept-edit-grid">
          <Field label="Name" value={memberDraft.name} onChange={(v) => setMemberDraft({ ...memberDraft, name: v })} />
          <Field label="Role" value={memberDraft.role} onChange={(v) => setMemberDraft({ ...memberDraft, role: v })} />
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => {
              onCreateMember(memberDraft);
              setMemberDraft({ name: "", role: "", sortOrder: team.members.length + 1 });
            }}
          >
            Add member
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  busy,
  onSave,
  onDelete,
}: {
  member: DeptStructure["teams"][number]["members"][number];
  busy: boolean;
  onSave: (input: { name: string; role: string; sortOrder: number }) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    name: member.name,
    role: member.role,
    sortOrder: member.sortOrder,
  });

  return (
    <div className="dept-edit-grid" style={{ marginBottom: 12 }}>
      <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Field label="Role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
      <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
        <button type="button" className="primary-button" disabled={busy} onClick={() => onSave(form)}>
          Save
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`form-field ${className ?? ""}`}>
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`form-field ${className ?? ""}`}>
      <label>{label}</label>
      <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
