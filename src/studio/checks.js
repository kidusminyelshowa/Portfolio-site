// What needs Kidus's attention today. Pure, so the Today page and the daily email (api/daily-check.js) agree.
import { formatDate, formatMoney, invoiceTotals } from '../proposal/money.js';

const DAY = 24 * 60 * 60 * 1000;
const daysSince = (iso, now) => Math.floor((now - new Date(iso).getTime()) / DAY);
const isoDay = (date) => date.toISOString().slice(0, 10);

export const thresholds = { newLeadDays: 2, quietLeadDays: 7, proposalFollowUpDays: 5, projectDueSoonDays: 7 };

const leadName = (lead) => lead.name || lead.company || lead.email || 'A lead';
const clientOf = (row) => row.client_company || row.client_name || 'the client';

export function needsAttention({ leads = [], proposals = [], invoices = [], projects = [], tasks = [] }, now = Date.now()) {
    const today = isoDay(new Date(now));
    const soon = isoDay(new Date(now + thresholds.projectDueSoonDays * DAY));
    const items = [];

    invoices
        .filter((inv) => inv.status === 'issued' && inv.due_on && inv.due_on < today)
        .forEach((inv) =>
            items.push({
                key: `invoice-${inv.id}`,
                kind: 'Overdue invoice',
                title: `${inv.number} · ${formatMoney(invoiceTotals(inv).total, inv.currency)}`,
                detail: `${inv.client?.client_company || inv.client?.client_name || 'Client'} · was due ${formatDate(inv.due_on)}`,
                to: '/studio/invoices',
                urgent: true,
            }),
        );

    proposals
        .filter((p) => p.status === 'changes requested')
        .forEach((p) =>
            items.push({
                key: `changes-${p.id}`,
                kind: 'Changes requested',
                title: p.title || `Proposal for ${clientOf(p)}`,
                detail: p.client_note ? `"${p.client_note}"` : `${clientOf(p)} asked for changes`,
                to: `/studio/proposals/${p.id}`,
                urgent: true,
            }),
        );

    proposals
        .filter((p) => ['sent', 'viewed'].includes(p.status) && p.sent_at && daysSince(p.sent_at, now) >= thresholds.proposalFollowUpDays)
        .forEach((p) =>
            items.push({
                key: `follow-${p.id}`,
                kind: 'Follow up',
                title: p.title || `Proposal for ${clientOf(p)}`,
                detail: `Sent ${daysSince(p.sent_at, now)} days ago${p.viewed_at ? ', opened' : ', not opened yet'}`,
                to: `/studio/proposals/${p.id}`,
            }),
        );

    const invoicedProposals = new Set(invoices.map((inv) => inv.proposal_id));
    proposals
        .filter((p) => p.status === 'accepted' && !invoicedProposals.has(p.id))
        .forEach((p) =>
            items.push({
                key: `accepted-${p.id}`,
                kind: 'Accepted, not invoiced',
                title: p.title || `Proposal for ${clientOf(p)}`,
                detail: 'Create the contract and first invoice',
                to: `/studio/proposals/${p.id}`,
            }),
        );

    leads
        .filter((lead) => lead.status === 'new' && daysSince(lead.created_at, now) >= thresholds.newLeadDays)
        .forEach((lead) =>
            items.push({
                key: `lead-${lead.id}`,
                kind: 'Reply to lead',
                title: leadName(lead),
                detail: `Came in ${daysSince(lead.created_at, now)} days ago`,
                to: '/studio/leads',
            }),
        );

    leads
        .filter((lead) => ['replied', 'in progress'].includes(lead.status) && daysSince(lead.updated_at ?? lead.created_at, now) >= thresholds.quietLeadDays)
        .forEach((lead) =>
            items.push({
                key: `quiet-${lead.id}`,
                kind: 'Gone quiet',
                title: leadName(lead),
                detail: `No change in ${daysSince(lead.updated_at ?? lead.created_at, now)} days`,
                to: '/studio/leads',
            }),
        );

    const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
    tasks
        .filter((t) => t.status !== 'done' && t.due_on && t.due_on <= today)
        .forEach((t) =>
            items.push({
                key: `task-${t.id}`,
                kind: t.due_on < today ? 'Task overdue' : 'Task due today',
                title: t.title,
                detail: projectNames[t.project_id] ?? 'Project',
                to: '/studio/projects',
                urgent: t.due_on < today,
            }),
        );

    projects
        .filter((p) => p.status !== 'done' && p.due_on && p.due_on <= soon)
        .forEach((p) =>
            items.push({
                key: `project-${p.id}`,
                kind: p.due_on < today ? 'Project overdue' : 'Project due soon',
                title: p.name,
                detail: `Due ${formatDate(p.due_on)}`,
                to: '/studio/projects',
                urgent: p.due_on < today,
            }),
        );

    return items.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
}
