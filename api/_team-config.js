/* Team app — default configuration.
   The studio's growth criteria (levels, skills, milestones, ratings), plus the extra
   settings the app needs (skill requirements, leave policy, sales targets).
   Admins edit a copy of this in Settings; it is stored in the database, so
   changing this file only affects a fresh install. */

export const RATING_SCALE = [
  { value: 1, label: 'Significantly below expectations', description: 'Substantially below the expectations of the current level and needs immediate improvement.' },
  { value: 2, label: 'Below expectations', description: 'Some expectations are met, but performance is inconsistent or below the level standard.' },
  { value: 3, label: 'Meets expectations', description: 'Consistently performs the responsibilities expected at the current level.' },
  { value: 4, label: 'Frequently exceeds expectations', description: 'Often performs above the current-level expectation and shows growing independence.' },
  { value: 5, label: 'Consistently exceptional at current level', description: 'Exceptional current-level performance with strong judgment, reliability and impact.' }
];

export const UNIVERSAL = [
  { id: 'quality', name: 'Quality', weight: 0.25, description: 'Quality and standard of delivered work.' },
  { id: 'execution', name: 'Execution', weight: 0.20, description: 'Reliability, deadlines, accuracy and consistency.' },
  { id: 'ownership', name: 'Ownership', weight: 0.20, description: 'Independence, accountability and responsibility.' },
  { id: 'collaboration', name: 'Collaboration', weight: 0.15, description: 'Communication, teamwork and constructive collaboration.' },
  { id: 'growth', name: 'Growth', weight: 0.20, description: 'Learning, skill development, initiative and improvement.' }
];

export const GOAL_TYPES = [
  { id: 'performance', name: 'Performance', description: 'Improves delivery and performance in the current role.' },
  { id: 'skill_development', name: 'Skill development', description: 'Builds a capability or closes a skill gap.' },
  { id: 'level_up', name: 'Level-up / responsibility', description: 'Demonstrates capability expected at the next level.' }
];

export const GOAL_STATUSES = ['draft', 'active', 'at_risk', 'completed', 'cancelled'];
export const MILESTONE_STATUSES = ['not_started', 'in_progress', 'achieved', 'blocked', 'reviewed'];
export const PROMOTION_STATUSES = [
  { id: 'not_ready', label: 'Not ready' },
  { id: 'developing', label: 'Developing toward next level' },
  { id: 'management_review', label: 'Ready for management review' },
  { id: 'approved', label: 'Approved' }
];
export const LEAVE_TYPES = [
  { id: 'annual', name: 'Annual leave', counts: true },
  { id: 'sick', name: 'Sick leave', counts: true },
  { id: 'unpaid', name: 'Unpaid leave', counts: false },
  { id: 'other', name: 'Other', counts: false }
];

const lv = (id, name, order, description) => ({ id, name, order, description });

export const DEPARTMENTS = [
  { id: 'design', name: 'Design', tracks: [
    { id: 'design_track', name: 'Design', levels: [
      lv('intern', 'Intern', 1, 'Learns the studio’s design process, tools and quality expectations while supporting project work.'),
      lv('junior_designer', 'Junior Designer', 2, 'Executes defined design work with increasing independence and consistent quality.'),
      lv('designer', 'Designer', 3, 'Thinks and executes independently, translating briefs into strong design solutions.'),
      lv('senior_designer_art_director', 'Senior Designer / Art Director', 4, 'Leads creative thinking and delivery while elevating the work and helping others grow.')
    ] }
  ] },
  { id: 'creative', name: 'Creative Leadership', tracks: [
    { id: 'creative_direction_track', name: 'Creative Direction', levels: [
      lv('creative_director', 'Creative Director', 1, 'Owns the creative standard across the studio, leads the thinking and grows the people who make the work.'),
      lv('executive_creative_director', 'Executive Creative Director', 2, 'Sets the studio’s creative direction and reputation, and builds the leaders under them.')
    ] }
  ] },
  { id: 'video_production', name: 'Video Production', tracks: [
    { id: 'cinematography_track', name: 'Cinematography', levels: [
      lv('cinematographer', 'Cinematographer', 1, 'Creates professional footage with strong technical execution and growing creative judgment.'),
      lv('senior_cinematographer', 'Senior Cinematographer', 2, 'Leads cinematography decisions and owns more complex productions.')
    ] },
    { id: 'editing_track', name: 'Editing', levels: [
      lv('editor', 'Editor', 1, 'Turns footage into clear, compelling edits with strong pacing, sound and visual consistency.'),
      lv('senior_editor', 'Senior Editor', 2, 'Owns complex edits and makes strong editorial decisions independently.')
    ] }
  ] },
  { id: 'admin', name: 'Admin', tracks: [
    { id: 'operations_track', name: 'Operations', levels: [
      lv('operations_manager', 'Operations Manager', 1, 'Coordinates people, projects and systems so work moves smoothly and reliably.'),
      lv('senior_operations_manager', 'Senior Operations Manager', 2, 'Owns broader operational systems, resource planning and organisational improvement.')
    ] },
    { id: 'marketing_track', name: 'Marketing', levels: [
      lv('marketing_manager', 'Marketing Manager', 1, 'Builds and executes marketing that grows awareness, demand and opportunities.'),
      lv('senior_marketing_manager', 'Senior Marketing Manager', 2, 'Owns broader marketing strategy and measurable growth programmes.')
    ] }
  ] },
  { id: 'partners', name: 'Creative Partners', tracks: [
    { id: 'partner_track', name: 'Creative Partner', levels: [
      lv('creative_partner', 'Creative Partner', 1, 'A freelance specialist who joins projects for specific work. Tasks only: no goals, reviews or leave.')
    ] }
  ] },
  { id: 'sales', name: 'Sales', tracks: [
    { id: 'sales_track', name: 'Sales', levels: [
      lv('sales_representative', 'Sales Representative', 1, 'Generates, qualifies and advances opportunities through the pipeline.'),
      lv('senior_sales_representative', 'Senior Sales Representative', 2, 'Drives stronger pipeline quality, conversion and revenue with greater ownership.')
    ] }
  ] }
];

/* Role criteria double as the skill list for each level.
   `req` is the rating expected at that level; the next level's list sets the bar to reach. */
const sk = (name, req) => ({ name, req: req || 3 });

export const LEVEL_SKILLS = {
  creative_director: ['Creative direction', 'Concept development', 'Visual systems', 'Strategic thinking', 'Client leadership', 'Team leadership', 'Quality control', 'Mentoring', 'Commercial awareness', 'AI / emerging creative tools'].map(n => sk(n, 4)),
  executive_creative_director: ['Creative vision', 'Studio positioning', 'Client leadership', 'Team leadership', 'Quality control', 'Mentoring and hiring', 'Commercial strategy', 'New business', 'AI / emerging creative tools'].map(n => sk(n, 5)),
  intern: ['Visual fundamentals', 'Typography and layout', 'Tool proficiency', 'Following briefs and direction', 'File organization', 'Learning speed', 'Attention to detail', 'Responsiveness to feedback'].map(n => sk(n, 3)),
  junior_designer: ['Visual execution', 'Typography and layout', 'Concept development', 'Brand understanding', 'Design systems', 'Presentation', 'Client understanding', 'Independence', 'Creative problem solving', 'AI / emerging creative tools'].map(n => sk(n, 3)),
  designer: ['Visual execution', 'Typography and layout', 'Concept development', 'Brand thinking', 'Design systems', 'Presentation and rationale', 'Client understanding', 'Project ownership', 'Creative problem solving', 'AI / emerging creative tools'].map(n => sk(n, 4)),
  senior_designer_art_director: ['Creative direction', 'Concept development', 'Visual systems', 'Strategic thinking', 'Client leadership', 'Project leadership', 'Quality control', 'Mentoring', 'Creative problem solving', 'AI / emerging creative tools'].map(n => sk(n, 4)),
  cinematographer: ['Visual composition', 'Camera operation', 'Lighting', 'Cinematography', 'Production planning', 'Storytelling', 'Adaptability on location', 'Client / brief understanding', 'Production efficiency', 'Initiative'].map(n => sk(n, 3)),
  senior_cinematographer: ['Visual composition', 'Advanced camera operation', 'Lighting design', 'Cinematography direction', 'Production planning', 'Storytelling', 'Location problem solving', 'Client / brief interpretation', 'Production efficiency', 'Leadership'].map(n => sk(n, 4)),
  editor: ['Editing', 'Storytelling', 'Pacing', 'Sound', 'Color', 'Motion graphics', 'Social content', 'Creative interpretation', 'Editing speed / efficiency', 'Project and file organization', 'Revision handling'].map(n => sk(n, 3)),
  senior_editor: ['Editing', 'Storytelling', 'Advanced pacing', 'Sound design', 'Color', 'Motion graphics', 'Platform-specific editing', 'Creative interpretation', 'Editing efficiency', 'Project organization', 'Revision leadership', 'Editorial leadership'].map(n => sk(n, 4)),
  operations_manager: ['Project coordination', 'Team coordination', 'Deadline management', 'Resource management', 'Process building', 'Communication', 'Problem solving', 'Documentation', 'Financial awareness', 'Accountability'].map(n => sk(n, 3)),
  senior_operations_manager: ['Project coordination', 'Team coordination', 'Operational planning', 'Resource management', 'Process design', 'Communication', 'Problem solving', 'Documentation', 'Financial awareness', 'Leadership', 'Founder-intervention reduction'].map(n => sk(n, 4)),
  marketing_manager: ['Marketing strategy', 'Content quality and consistency', 'Campaign execution', 'Audience understanding', 'Lead generation', 'Analytics', 'Brand consistency', 'Experimentation', 'Reporting', 'Initiative'].map(n => sk(n, 3)),
  senior_marketing_manager: ['Marketing strategy', 'Campaign leadership', 'Audience insight', 'Demand generation', 'Analytics', 'Brand management', 'Experimentation', 'Reporting', 'Cross-functional leadership', 'Business impact'].map(n => sk(n, 4)),
  sales_representative: ['Qualified lead generation', 'Meeting generation', 'Qualification', 'Proposal progression', 'Conversion', 'Revenue generation', 'Follow-up discipline', 'CRM / pipeline management', 'Communication and professionalism', 'Commercial understanding'].map(n => sk(n, 3)),
  senior_sales_representative: ['Qualified lead generation', 'Meeting generation', 'Qualification', 'Proposal progression', 'Conversion', 'Revenue generation', 'Follow-up discipline', 'Pipeline management', 'Negotiation', 'Account growth', 'Commercial strategy'].map(n => sk(n, 4))
};

/* Promotion milestones suggested when someone is set up at a level. */
export const LEVEL_MILESTONES = {
  creative_director: ['Sets the creative standard for every project leaving the studio', 'Leads the thinking on the studio’s biggest accounts', 'Grows designers into independent owners of work', 'Defends creative direction with senior clients', 'Builds repeatable creative process', 'Raises the quality bar measurably across a quarter'],
  intern: ['Understands and follows the studio’s design workflow', 'Executes assigned work with improving consistency', 'Demonstrates basic typography and layout competency', 'Keeps files organised and ready for handoff', 'Responds well to feedback', 'Completes defined tasks with limited supervision'],
  junior_designer: ['Translates a brief into a clear design direction', 'Develops multiple concepts with limited supervision', 'Produces professional-quality execution consistently', 'Handles revisions independently', 'Explains design decisions clearly', 'Maintains consistency across multiple assets', 'Completes multiple real client projects successfully', 'Leads at least one small project independently'],
  designer: ['Leads complex creative work', 'Demonstrates strong conceptual thinking', 'Raises the quality of other team members’ work', 'Defends creative direction to clients', 'Owns creative decisions under ambiguity', 'Mentors or reviews junior team members', 'Demonstrates consistent high-level judgment'],
  cinematographer: ['Independently plans the visual approach', 'Owns complex shoots', 'Consistently creates strong lighting and composition', 'Solves production problems calmly', 'Guides other production contributors', 'Improves production efficiency'],
  editor: ['Owns complex edits from footage review to delivery', 'Demonstrates strong editorial judgment', 'Handles complex client revisions', 'Maintains efficient workflows', 'Mentors or reviews other editors', 'Improves storytelling beyond the raw brief'],
  operations_manager: ['Builds repeatable systems', 'Owns operational planning with limited founder intervention', 'Improves delivery reliability', 'Coordinates multiple priorities effectively', 'Improves team visibility and accountability', 'Demonstrates measurable process improvements'],
  marketing_manager: ['Builds measurable marketing strategy', 'Generates meaningful business opportunities', 'Runs campaigns independently', 'Uses analytics to improve decisions', 'Owns reporting and learning loops', 'Demonstrates measurable growth impact'],
  sales_representative: ['Builds a healthy qualified pipeline', 'Maintains disciplined follow-up', 'Improves proposal-to-close conversion', 'Consistently contributes revenue', 'Handles objections and negotiation effectively', 'Manages opportunities through the full funnel independently']
};

export const SALES_KPIS = [
  { id: 'qualified_leads', name: 'Qualified leads', weight: 0.20, format: 'number', target: 20 },
  { id: 'meetings_opportunities', name: 'Meetings / opportunities', weight: 0.15, format: 'number', target: 10 },
  { id: 'proposals', name: 'Proposals sent', weight: 0, format: 'number', target: 6 },
  { id: 'deals_won', name: 'Deals won', weight: 0, format: 'number', target: 3 },
  { id: 'conversion_rate', name: 'Conversion rate', weight: 0.20, format: 'percentage', target: 25 },
  { id: 'revenue_generated', name: 'Revenue generated', weight: 0.25, format: 'currency', target: 400000 },
  { id: 'follow_up_discipline', name: 'Follow-up discipline', weight: 0.10, format: 'rating', target: 4 },
  { id: 'crm_pipeline_management', name: 'CRM / pipeline management', weight: 0.05, format: 'rating', target: 4 },
  { id: 'communication_professionalism', name: 'Communication and professionalism', weight: 0.05, format: 'rating', target: 4 }
];

export const PIPELINE_STAGES = ['lead', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];

export const KPI_TEMPLATES = {
  operations: ['Projects delivered on time', 'Operational issues resolved', 'Processes improved', 'Founder interventions reduced', 'Documentation completed'],
  marketing: ['Qualified leads generated', 'Campaigns delivered', 'Website traffic', 'Marketing opportunities generated', 'Engagement quality'],
  design: ['Projects delivered on time', 'Design revisions reduced', 'Projects independently led', 'Presentation quality improved', 'New creative skill demonstrated'],
  video: ['Projects delivered on time', 'Production efficiency', 'Editing turnaround time', 'Client revision rounds', 'New production technique demonstrated'],
  sales: ['Qualified leads generated', 'Meetings booked', 'Proposals sent', 'Deals won', 'Revenue generated']
};

export const DEFAULT_SETTINGS = {
  universal: UNIVERSAL,
  ratingScale: RATING_SCALE,
  departments: DEPARTMENTS,
  levelSkills: LEVEL_SKILLS,
  levelMilestones: LEVEL_MILESTONES,
  goalTypes: GOAL_TYPES,
  salesKpis: SALES_KPIS,
  kpiTemplates: KPI_TEMPLATES,
  goalsPerQuarter: 3,
  reviewCadence: { monthly: true, quarterlyMonths: 3 },
  promotion: {
    components: { milestones: 0.30, skills: 0.30, performance: 0.20, responsibility: 0.20 },
    thresholds: { developing: 0.50, management_review: 0.75, approved: 0.90 },
    responsibilityExamplesRequired: 3,
    performanceMonths: 3
  },
  leave: {
    annualDays: 16, sickDays: 10, workDays: [1, 2, 3, 4, 5], noticeDays: 3,
    yearStartMonth: 9, yearStartDay: 11,      // also starts the review year; the Ethiopia preset
    accrue: true                              // 16 ÷ 12 = 1.33 days per completed month
  },
  reviews: { acknowledge: true },            // employees confirm they have read an approved review
  holidays: { preset: 'ethiopia', custom: [] },   // greetings suggested on the Messages page
  currency: 'ETB'
};

/* helpers shared by server and browser */
export function allLevels(settings) {
  const out = [];
  (settings.departments || []).forEach(d => (d.tracks || []).forEach(t => (t.levels || []).forEach(l =>
    out.push({ ...l, departmentId: d.id, departmentName: d.name, trackId: t.id, trackName: t.name }))));
  return out;
}
export function findLevel(settings, levelId) { return allLevels(settings).find(l => l.id === levelId) || null; }
export function nextLevel(settings, levelId) {
  const cur = findLevel(settings, levelId);
  if (!cur) return null;
  return allLevels(settings).find(l => l.trackId === cur.trackId && l.order === cur.order + 1) || null;
}
/* creative partners: freelancers who take tasks, outside the growth system */
export const PARTNER_DEPT = 'partners';
export const isPartner = e => !!e && e.departmentId === PARTNER_DEPT;
export function levelSkills(settings, levelId) { return (settings.levelSkills || {})[levelId] || []; }
