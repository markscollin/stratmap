export interface RoleTemplate {
  id: string
  title: string
  dept: string
  uses: number
  updatedBy: string
  updated: string
  tags: string[]
}

export interface RoleSearchResult {
  chart: string
  dept: string
  title: string
  status: 'active' | 'open' | 'planned'
  person: string | null
  version: number
}

export const mockRoleTemplates: RoleTemplate[] = [
  { id:'1', title:'Senior Software Engineer', dept:'Engineering',  uses:4, updatedBy:'Jamie D', updated:'3 days ago',  tags:['IC','Technical'] },
  { id:'2', title:'Product Manager',          dept:'Product',      uses:2, updatedBy:'Sarah R', updated:'1 week ago',  tags:['PM','Leadership'] },
  { id:'3', title:'UX Designer',              dept:'Design',       uses:3, updatedBy:'Tara L',  updated:'2 weeks ago', tags:['Design','IC'] },
  { id:'4', title:'Head of Engineering',      dept:'Engineering',  uses:1, updatedBy:'Jamie D', updated:'1 month ago', tags:['Leadership','Director'] },
  { id:'5', title:'Sales Development Rep',    dept:'Go-to-Market', uses:5, updatedBy:'Mark K',  updated:'5 days ago',  tags:['Sales','IC'] },
  { id:'6', title:'QA Engineer',              dept:'Engineering',  uses:3, updatedBy:'Jamie D', updated:'2 weeks ago', tags:['QA','IC'] },
]

export const mockRoleSearchResults: RoleSearchResult[] = [
  { chart:'Current Structure',      dept:'Engineering', title:'QA Engineer', status:'active',  person:'Alex Chen',  version:3 },
  { chart:'Current Structure',      dept:'Engineering', title:'QA Engineer', status:'active',  person:'Priya Nair', version:3 },
  { chart:'Q3 Hiring Plan',         dept:'Engineering', title:'QA Engineer', status:'open',    person:null,         version:2 },
  { chart:'Post-Series B Scenario', dept:'Engineering', title:'QA Lead',     status:'planned', person:null,         version:1 },
]
