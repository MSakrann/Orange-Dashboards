"use client";

import Link from "next/link";
import { useState } from "react";
import type { DeptStructure } from "@/data/dept-structure";
import { createClient } from "@/lib/supabase/client";
import {
  createDeptMember,
  createDeptMilestone,
  createDeptProject,
  createDeptTeam,
  createDeptTimelineItem,
  deleteDeptMember,
  deleteDeptMilestone,
  deleteDeptProject,
  deleteDeptTeam,
  deleteDeptTimelineItem,
  DeptMutationError,
  updateDeptMember,
  updateDeptMilestone,
  updateDeptProfile,
  updateDeptProject,
  updateDeptTeam,
  updateDeptTimelineItem,
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

      <ProjectsSection
        data={data}
        busy={busy}
        onCreateProject={(input) =>
          run(async () => {
            await createDeptProject(createClient(), input);
          }, "Project created.")
        }
        onUpdateProject={(id, input) =>
          run(async () => {
            await updateDeptProject(createClient(), id, input);
          }, "Project updated.")
        }
        onDeleteProject={(id) =>
          run(async () => {
            await deleteDeptProject(createClient(), id);
          }, "Project deleted.")
        }
        onCreateMilestone={(projectId, input) =>
          run(async () => {
            await createDeptMilestone(createClient(), projectId, input);
          }, "Milestone added.")
        }
        onUpdateMilestone={(id, input) =>
          run(async () => {
            await updateDeptMilestone(createClient(), id, input);
          }, "Milestone updated.")
        }
        onDeleteMilestone={(id) =>
          run(async () => {
            await deleteDeptMilestone(createClient(), id);
          }, "Milestone deleted.")
        }
      />

      <TimelineSection
        data={data}
        busy={busy}
        onCreate={(input) =>
          run(async () => {
            await createDeptTimelineItem(createClient(), input);
          }, "Timeline item created.")
        }
        onUpdate={(id, input) =>
          run(async () => {
            await updateDeptTimelineItem(createClient(), id, input);
          }, "Timeline item updated.")
        }
        onDelete={(id) =>
          run(async () => {
            await deleteDeptTimelineItem(createClient(), id);
          }, "Timeline item deleted.")
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
        <NumberField label="Teams stat" value={form.statTeams} onChange={(v) => setForm({ ...form, statTeams: v })} />
        <NumberField label="Members stat" value={form.statMembers} onChange={(v) => setForm({ ...form, statMembers: v })} />
        <NumberField label="Active projects stat" value={form.statActiveProjects} onChange={(v) => setForm({ ...form, statActiveProjects: v })} />
        <NumberField label="On-track %" value={form.statOnTrackPct} onChange={(v) => setForm({ ...form, statOnTrackPct: v })} />
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
  onCreateTeam: (input: { name: string; leadName: string; focus: string; goal: string; scope: string; sortOrder: number }) => void;
  onUpdateTeam: (id: string, input: { name: string; leadName: string; focus: string; goal: string; scope: string; sortOrder: number }) => void;
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
    sortOrder: data.teams.length,
  });

  return (
    <section className="dept-edit-section">
      <h2>Teams ({data.teams.length}/5)</h2>
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

      {data.teams.length < 5 ? (
        <div className="dept-edit-entity">
          <h3>Add team</h3>
          <div className="dept-edit-grid">
            <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Lead" value={draft.leadName} onChange={(v) => setDraft({ ...draft, leadName: v })} />
            <Field className="full" label="Focus" value={draft.focus} onChange={(v) => setDraft({ ...draft, focus: v })} />
            <Field className="full" label="Goal" value={draft.goal} onChange={(v) => setDraft({ ...draft, goal: v })} />
            <Field className="full" label="Scope" value={draft.scope} onChange={(v) => setDraft({ ...draft, scope: v })} />
            <NumberField label="Sort order" value={draft.sortOrder} onChange={(v) => setDraft({ ...draft, sortOrder: v })} />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => {
                onCreateTeam(draft);
                setDraft({ name: "", leadName: "", focus: "", goal: "", scope: "", sortOrder: data.teams.length + 1 });
              }}
            >
              Add team
            </button>
          </div>
        </div>
      ) : (
        <p className="dept-empty">Maximum of 5 teams reached.</p>
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
  onSave: (input: { name: string; leadName: string; focus: string; goal: string; scope: string; sortOrder: number }) => void;
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

function ProjectsSection({
  data,
  busy,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: {
  data: DeptStructure;
  busy: boolean;
  onCreateProject: (input: {
    teamId: string | null;
    title: string;
    summary: string;
    isHighlighted: boolean;
    ownerName: string;
    startDate: string | null;
    endDate: string | null;
    progressPct: number;
    statusLabel: string;
    sortOrder: number;
  }) => void;
  onUpdateProject: (
    id: string,
    input: {
      teamId: string | null;
      title: string;
      summary: string;
      isHighlighted: boolean;
      ownerName: string;
      startDate: string | null;
      endDate: string | null;
      progressPct: number;
      statusLabel: string;
      sortOrder: number;
    },
  ) => void;
  onDeleteProject: (id: string) => void;
  onCreateMilestone: (projectId: string, input: { title: string; dueDate: string | null; isDone: boolean; sortOrder: number }) => void;
  onUpdateMilestone: (id: string, input: { title: string; dueDate: string | null; isDone: boolean; sortOrder: number }) => void;
  onDeleteMilestone: (id: string) => void;
}) {
  const highlightedCount = data.projects.filter((p) => p.isHighlighted).length;
  const [draft, setDraft] = useState({
    teamId: data.teams[0]?.id ?? "",
    title: "",
    summary: "",
    isHighlighted: false,
    ownerName: "",
    startDate: "",
    endDate: "",
    progressPct: 0,
    statusLabel: "",
    sortOrder: data.projects.length,
  });

  return (
    <section className="dept-edit-section">
      <h2>Projects (highlighted {highlightedCount}/3)</h2>
      {data.projects.map((project) => (
        <ProjectEditor
          key={project.id}
          project={project}
          teams={data.teams}
          busy={busy}
          onSave={(input) => onUpdateProject(project.id, input)}
          onDelete={() => onDeleteProject(project.id)}
          onCreateMilestone={(input) => onCreateMilestone(project.id, input)}
          onUpdateMilestone={onUpdateMilestone}
          onDeleteMilestone={onDeleteMilestone}
        />
      ))}

      <div className="dept-edit-entity">
        <h3>Add project</h3>
        <div className="dept-edit-grid">
          <Field label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
          <div className="form-field">
            <label>Team</label>
            <select
              value={draft.teamId}
              onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <TextArea className="full" label="Summary" value={draft.summary} onChange={(v) => setDraft({ ...draft, summary: v })} />
          <Field label="Owner" value={draft.ownerName} onChange={(v) => setDraft({ ...draft, ownerName: v })} />
          <Field label="Status" value={draft.statusLabel} onChange={(v) => setDraft({ ...draft, statusLabel: v })} />
          <Field label="Start date" value={draft.startDate} onChange={(v) => setDraft({ ...draft, startDate: v })} />
          <Field label="End date" value={draft.endDate} onChange={(v) => setDraft({ ...draft, endDate: v })} />
          <NumberField label="Progress %" value={draft.progressPct} onChange={(v) => setDraft({ ...draft, progressPct: v })} />
          <NumberField label="Sort order" value={draft.sortOrder} onChange={(v) => setDraft({ ...draft, sortOrder: v })} />
          <label className="form-field">
            <span>Highlighted</span>
            <input
              type="checkbox"
              checked={draft.isHighlighted}
              onChange={(e) => setDraft({ ...draft, isHighlighted: e.target.checked })}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              onCreateProject({
                ...draft,
                teamId: draft.teamId || null,
                startDate: draft.startDate || null,
                endDate: draft.endDate || null,
              })
            }
          >
            Add project
          </button>
        </div>
      </div>
    </section>
  );
}

function ProjectEditor({
  project,
  teams,
  busy,
  onSave,
  onDelete,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: {
  project: DeptStructure["projects"][number];
  teams: DeptStructure["teams"];
  busy: boolean;
  onSave: (input: {
    teamId: string | null;
    title: string;
    summary: string;
    isHighlighted: boolean;
    ownerName: string;
    startDate: string | null;
    endDate: string | null;
    progressPct: number;
    statusLabel: string;
    sortOrder: number;
  }) => void;
  onDelete: () => void;
  onCreateMilestone: (input: { title: string; dueDate: string | null; isDone: boolean; sortOrder: number }) => void;
  onUpdateMilestone: (id: string, input: { title: string; dueDate: string | null; isDone: boolean; sortOrder: number }) => void;
  onDeleteMilestone: (id: string) => void;
}) {
  const [form, setForm] = useState({
    teamId: project.teamId ?? "",
    title: project.title,
    summary: project.summary,
    isHighlighted: project.isHighlighted,
    ownerName: project.ownerName,
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    progressPct: project.progressPct,
    statusLabel: project.statusLabel,
    sortOrder: project.sortOrder,
  });
  const [milestoneDraft, setMilestoneDraft] = useState({
    title: "",
    dueDate: "",
    isDone: false,
    sortOrder: project.milestones.length,
  });

  return (
    <div className="dept-edit-entity">
      <h3>{project.title}</h3>
      <div className="dept-edit-grid">
        <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <div className="form-field">
          <label>Team</label>
          <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
            <option value="">Unassigned</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <TextArea className="full" label="Summary" value={form.summary} onChange={(v) => setForm({ ...form, summary: v })} />
        <Field label="Owner" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
        <Field label="Status" value={form.statusLabel} onChange={(v) => setForm({ ...form, statusLabel: v })} />
        <Field label="Start date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
        <Field label="End date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
        <NumberField label="Progress %" value={form.progressPct} onChange={(v) => setForm({ ...form, progressPct: v })} />
        <NumberField label="Sort order" value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })} />
        <label className="form-field">
          <span>Highlighted</span>
          <input
            type="checkbox"
            checked={form.isHighlighted}
            onChange={(e) => setForm({ ...form, isHighlighted: e.target.checked })}
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() =>
            onSave({
              ...form,
              teamId: form.teamId || null,
              startDate: form.startDate || null,
              endDate: form.endDate || null,
            })
          }
        >
          Save project
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onDelete}>
          Delete project
        </button>
      </div>

      <div className="dept-edit-nested">
        <h3>Milestones</h3>
        {project.milestones.map((milestone) => (
          <MilestoneRow
            key={milestone.id}
            milestone={milestone}
            busy={busy}
            onSave={(input) => onUpdateMilestone(milestone.id, input)}
            onDelete={() => onDeleteMilestone(milestone.id)}
          />
        ))}
        <div className="dept-edit-grid">
          <Field label="Title" value={milestoneDraft.title} onChange={(v) => setMilestoneDraft({ ...milestoneDraft, title: v })} />
          <Field label="Due date" value={milestoneDraft.dueDate} onChange={(v) => setMilestoneDraft({ ...milestoneDraft, dueDate: v })} />
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              onCreateMilestone({
                title: milestoneDraft.title,
                dueDate: milestoneDraft.dueDate || null,
                isDone: milestoneDraft.isDone,
                sortOrder: milestoneDraft.sortOrder,
              })
            }
          >
            Add milestone
          </button>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({
  milestone,
  busy,
  onSave,
  onDelete,
}: {
  milestone: DeptStructure["projects"][number]["milestones"][number];
  busy: boolean;
  onSave: (input: { title: string; dueDate: string | null; isDone: boolean; sortOrder: number }) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    title: milestone.title,
    dueDate: milestone.dueDate ?? "",
    isDone: milestone.isDone,
    sortOrder: milestone.sortOrder,
  });

  return (
    <div className="dept-edit-grid" style={{ marginBottom: 12 }}>
      <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
      <Field label="Due date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
      <label className="form-field">
        <span>Done</span>
        <input type="checkbox" checked={form.isDone} onChange={(e) => setForm({ ...form, isDone: e.target.checked })} />
      </label>
      <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => onSave({ ...form, dueDate: form.dueDate || null })}
        >
          Save
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function TimelineSection({
  data,
  busy,
  onCreate,
  onUpdate,
  onDelete,
}: {
  data: DeptStructure;
  busy: boolean;
  onCreate: (input: { label: string; startDate: string | null; endDate: string | null; statusLabel: string; sortOrder: number }) => void;
  onUpdate: (id: string, input: { label: string; startDate: string | null; endDate: string | null; statusLabel: string; sortOrder: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    label: "",
    startDate: "",
    endDate: "",
    statusLabel: "",
    sortOrder: data.timeline.length,
  });

  return (
    <section className="dept-edit-section">
      <h2>Timeline</h2>
      {data.timeline.map((item) => (
        <TimelineRow
          key={item.id}
          item={item}
          busy={busy}
          onSave={(input) => onUpdate(item.id, input)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
      <div className="dept-edit-entity">
        <h3>Add timeline item</h3>
        <div className="dept-edit-grid">
          <Field label="Label" value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} />
          <Field label="Status" value={draft.statusLabel} onChange={(v) => setDraft({ ...draft, statusLabel: v })} />
          <Field label="Start date" value={draft.startDate} onChange={(v) => setDraft({ ...draft, startDate: v })} />
          <Field label="End date" value={draft.endDate} onChange={(v) => setDraft({ ...draft, endDate: v })} />
          <NumberField label="Sort order" value={draft.sortOrder} onChange={(v) => setDraft({ ...draft, sortOrder: v })} />
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              onCreate({
                label: draft.label,
                statusLabel: draft.statusLabel,
                startDate: draft.startDate || null,
                endDate: draft.endDate || null,
                sortOrder: draft.sortOrder,
              })
            }
          >
            Add item
          </button>
        </div>
      </div>
    </section>
  );
}

function TimelineRow({
  item,
  busy,
  onSave,
  onDelete,
}: {
  item: DeptStructure["timeline"][number];
  busy: boolean;
  onSave: (input: { label: string; startDate: string | null; endDate: string | null; statusLabel: string; sortOrder: number }) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    label: item.label,
    startDate: item.startDate ?? "",
    endDate: item.endDate ?? "",
    statusLabel: item.statusLabel,
    sortOrder: item.sortOrder,
  });

  return (
    <div className="dept-edit-entity">
      <div className="dept-edit-grid">
        <Field label="Label" value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
        <Field label="Status" value={form.statusLabel} onChange={(v) => setForm({ ...form, statusLabel: v })} />
        <Field label="Start date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
        <Field label="End date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
        <NumberField label="Sort order" value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })} />
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() =>
            onSave({
              ...form,
              startDate: form.startDate || null,
              endDate: form.endDate || null,
            })
          }
        >
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
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
