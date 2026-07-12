(() => {
  const API = 'api/portal';
  const ALL_PERMISSIONS = [
    'dashboard.view','announcements.manage','members.manage','users.manage','roles.manage','departments.manage','events.manage','applications.manage','images.manage','audit.view','discord.sync','settings.manage'
  ];
  let csrfToken = sessionStorage.getItem('bsrp_csrf') || '';
  let currentUser = null;
  let currentSection = 'dashboard';
  let currentItems = [];
  let filteredItems = [];
  let referenceData = { roles: [], members: [], departments: [] };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const sections = {
    announcements: {
      title: 'Announcements', eyebrow: 'PUBLIC CONTENT', permission: 'announcements.manage',
      columns: [['title','Title'],['category','Category'],['pinned','Pinned'],['published','Published'],['updatedAt','Updated']],
      fields: [
        {name:'title',label:'Title',required:true,full:true}, {name:'category',label:'Category'},
        {name:'body',label:'Announcement body',type:'textarea',required:true,full:true,help:'Published announcements automatically post to Discord channel 1520408782520193115.'},
        {name:'pinned',label:'Pin announcement',type:'checkbox'}, {name:'published',label:'Published',type:'checkbox',default:true}
      ]
    },
    members: {
      title: 'Members', eyebrow: 'COMMUNITY REGISTRY', permission: 'members.manage',
      columns: [['displayName','Member'],['discordUsername','Discord'],['department','Department'],['rank','Rank'],['roleMode','Role Control'],['status','Status']],
      fields: [
        {name:'displayName',label:'Display name',required:true}, {name:'email',label:'Email address',type:'email'},
        {name:'discordUsername',label:'Discord username'}, {name:'discordId',label:'Discord user ID'},
        {name:'characterName',label:'Character name'}, {name:'department',label:'Department',type:'departmentSelect'},
        {name:'departmentMode',label:'Department assignment',type:'select',options:[{value:'manual',label:'Manual — keep admin selection'},{value:'discord',label:'Discord — use mapped role department'}],default:'manual'},
        {name:'rank',label:'Rank'}, {name:'roleId',label:'Website role',type:'roleSelect'},
        {name:'roleMode',label:'Website role control',type:'select',options:[{value:'manual',label:'Manual — never overwrite during sync'},{value:'discord',label:'Discord — follow mapped Discord roles'}],default:'manual'},
        {name:'status',label:'Status',type:'select',options:['Active','Inactive','Suspended','Banned']},
        {name:'public',label:'Show on public staff roster',type:'checkbox'},
        {name:'notes',label:'Notes / public description',type:'textarea',full:true}
      ]
    },
    users: {
      title: 'Accounts', eyebrow: 'LOGIN MANAGEMENT', permission: 'users.manage',
      columns: [['displayName','Account'],['email','Email'],['roleName','Role'],['active','Active'],['lastLoginAt','Last Login']],
      fields: [
        {name:'displayName',label:'Display name',required:true}, {name:'email',label:'Email address',type:'email',required:true},
        {name:'roleId',label:'Access role',type:'roleSelect',required:true}, {name:'roleMode',label:'Role control',type:'select',options:[{value:'manual',label:'Manual — keep this access role'},{value:'discord',label:'Discord — follow linked member role'}],default:'manual'}, {name:'memberId',label:'Linked member profile',type:'memberSelect'},
        {name:'active',label:'Account active',type:'checkbox',default:true},
        {name:'newPassword',label:'New password',type:'password',full:true,help:'Required for new accounts. Leave blank when editing to keep the current password.'}
      ]
    },
    roles: {
      title: 'Roles & Permissions', eyebrow: 'ACCESS CONTROL', permission: 'roles.manage',
      columns: [['name','Role'],['priority','Priority'],['department','Department'],['discordRoleIds','Discord Role IDs'],['permissions','Permissions']],
      fields: [
        {name:'id',label:'Role ID',required:true}, {name:'name',label:'Role name',required:true},
        {name:'priority',label:'Role priority',type:'number',help:'Higher numbers win when a Discord member has more than one mapped role.'},
        {name:'department',label:'Mapped department',type:'departmentSelect',help:'Optional. Applied only to members using Discord department assignment.'},
        {name:'defaultRank',label:'Mapped default rank',help:'Optional rank applied with the mapped department.'},
        {name:'discordRoleIds',label:'Discord role IDs — one per line',type:'textarea',full:true,help:'Members with any listed Discord role can be linked to this website role during Discord sign-in and sync.'},
        {name:'permissions',label:'Permissions',type:'permissions',full:true}
      ]
    },
    departments: {
      title: 'Departments', eyebrow: 'ROLEPLAY STRUCTURE', permission: 'departments.manage',
      columns: [['name','Department'],['code','Code'],['open','Applications'],['published','Published'],['sortOrder','Order']],
      fields: [
        {name:'name',label:'Department name',required:true}, {name:'code',label:'Department code'},
        {name:'tagline',label:'Tagline',full:true}, {name:'description',label:'Description',type:'textarea',full:true},
        {name:'features',label:'Features — one per line',type:'textarea',full:true}, {name:'sortOrder',label:'Sort order',type:'number'},
        {name:'open',label:'Applications open',type:'checkbox',default:true}, {name:'published',label:'Published',type:'checkbox',default:true}
      ]
    },
    events: {
      title: 'Events', eyebrow: 'COMMUNITY CALENDAR', permission: 'events.manage',
      columns: [['title','Event'],['startsAt','Start'],['location','Location'],['published','Published']],
      fields: [
        {name:'title',label:'Event title',required:true}, {name:'startsAt',label:'Start date and time',type:'datetime-local'},
        {name:'location',label:'Location'}, {name:'description',label:'Description',type:'textarea',full:true},
        {name:'published',label:'Published',type:'checkbox',default:true}
      ]
    },
    applications: {
      title: 'Applications', eyebrow: 'REVIEW QUEUE', permission: 'applications.manage', addDisabled:true,
      columns: [['discord','Applicant'],['applicationType','Application'],['fivem','CFX'],['status','Status'],['submittedAt','Submitted']],
      fields: [
        {name:'applicationType',label:'Application type',type:'readonly'}, {name:'discord',label:'Discord username',type:'readonly'},
        {name:'discordId',label:'Discord user ID',type:'readonly'}, {name:'age',label:'Age',type:'readonly'},
        {name:'timezone',label:'Time zone',type:'readonly'}, {name:'fivem',label:'FiveM / CFX username',type:'readonly'},
        {name:'experience',label:'Roleplay experience',type:'readonly'}, {name:'availability',label:'Availability',type:'readonly'},
        {name:'history',label:'Previous roleplay experience',type:'readonly-long',full:true},
        {name:'character',label:'Character or story',type:'readonly-long',full:true},
        {name:'quality',label:'Quality roleplay answer',type:'readonly-long',full:true},
        {name:'scenario1',label:'Scenario 1',type:'readonly-long',full:true},
        {name:'scenario2',label:'Scenario 2',type:'readonly-long',full:true},
        {name:'scenario3',label:'Scenario 3',type:'readonly-long',full:true},
        {name:'status',label:'Application status',type:'select',options:['Pending','Under Review','Accepted','Declined','Changes Requested']},
        {name:'staffNotes',label:'Staff notes',type:'textarea',full:true}
      ]
    },
    images: {
      title: 'Featured Images', eyebrow: 'WEBSITE MEDIA', permission: 'images.manage',
      columns: [['title','Title'],['url','Image URL'],['published','Published'],['sortOrder','Order']],
      fields: [
        {name:'title',label:'Image title'}, {name:'url',label:'HTTPS image URL',type:'url',required:true},
        {name:'caption',label:'Caption',type:'textarea',full:true}, {name:'sortOrder',label:'Sort order',type:'number'},
        {name:'published',label:'Published',type:'checkbox',default:true}
      ]
    },
    audit: {
      title: 'Audit History', eyebrow: 'SECURITY & ACCOUNTABILITY', permission: 'audit.view', addDisabled:true, deleteDisabled:true, editDisabled:true,
      columns: [['at','Time'],['actorName','Staff Member'],['action','Action'],['entity','Section'],['targetId','Record']]
    }
  };

  async function api(action, options = {}, retry = true) {
    const query = new URLSearchParams({ action, ...(options.query || {}) });
    const response = await fetch(`${API}?${query}`, {
      method: options.method || 'GET',
      headers: { Accept:'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(csrfToken ? {'X-CSRF-Token':csrfToken} : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials:'same-origin', cache:'no-store'
    });
    const payload = await response.json().catch(() => ({ok:false,message:'Invalid server response.'}));
    if (response.status === 401 && retry && action !== 'login' && action !== 'refresh') {
      try {
        const refreshed = await api('refresh', {method:'POST'}, false);
        if (refreshed.csrfToken) setCsrf(refreshed.csrfToken);
        return api(action, options, false);
      } catch {}
    }
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.message || `Request failed (${response.status}).`);
      error.status = response.status; error.payload = payload; throw error;
    }
    if (payload.csrfToken) setCsrf(payload.csrfToken);
    return payload;
  }

  function setCsrf(value){csrfToken=value||'';if(csrfToken)sessionStorage.setItem('bsrp_csrf',csrfToken);else sessionStorage.removeItem('bsrp_csrf')}
  function initials(value){return String(value||'B').split(/\s+/).map(p=>p[0]).join('').slice(0,2).toUpperCase()}
  function hasPermission(permission){return Boolean(currentUser?.permissions?.includes(permission))}
  function toast(message){const el=$('#adminToast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
  function formatValue(key,value){
    if(value===true)return 'Yes'; if(value===false)return 'No';
    if(Array.isArray(value))return value.join(', ');
    if(!value)return '—';
    if(/At$/.test(key)||key==='startsAt'){const d=new Date(value);if(!Number.isNaN(d.getTime()))return d.toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'});}
    return String(value);
  }
  function download(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}

  async function checkSetup(){
    try{const data=await api('setup-status');const state=$('#setupState');const discordButton=$('.discord-admin-login');const divider=$('.admin-login-divider');if(discordButton)discordButton.hidden=!data.discordOAuthConfigured;if(divider)divider.hidden=!data.discordOAuthConfigured;
      if(data.databaseConfigured&&data.authConfigured&&data.bootstrapAdminConfigured){state.className='setup-state ready';state.innerHTML='<strong>VERCEL BACKEND READY</strong><p>Database, secure authentication and bootstrap administrator are configured.</p>'}
      else{state.className='setup-state error';const missing=[];if(!data.databaseConfigured)missing.push('Upstash Redis');if(!data.authConfigured)missing.push('AUTH_SECRET');if(!data.bootstrapAdminConfigured)missing.push('ADMIN_EMAIL / ADMIN_PASSWORD');state.innerHTML=`<strong>SETUP REQUIRED</strong><p>Missing: ${missing.join(', ')}. Follow PORTAL-ADMIN-SETUP.md, then redeploy.</p>`}
    }catch(error){const discordButton=$('.discord-admin-login');const divider=$('.admin-login-divider');if(discordButton)discordButton.hidden=true;if(divider)divider.hidden=true;$('#setupState').className='setup-state error';$('#setupState').innerHTML=`<strong>SETUP CHECK FAILED</strong><p>${error.message}</p>`}
  }

  function configureNavigation(){
    $$('#adminNav button').forEach(btn=>{const permission=btn.dataset.permission;btn.hidden=Boolean(permission&&!hasPermission(permission));});
    $$('[data-open-section]').forEach(btn=>{const section=btn.dataset.openSection;const permission=sections[section]?.permission;btn.hidden=Boolean(permission&&!hasPermission(permission));});
  }

  function enterApp(user){
    currentUser=user;$('#loginScreen').hidden=true;$('#adminApp').hidden=false;$('#identityName').textContent=user.displayName||user.email;$('#identityRole').textContent=(user.roleName||'Staff').toUpperCase();$('#identityAvatar').textContent=initials(user.displayName);configureNavigation();openSection('dashboard');
  }
  function leaveApp(){currentUser=null;setCsrf('');$('#adminApp').hidden=true;$('#loginScreen').hidden=false;$('#adminLoginForm').reset()}

  async function restoreSession(){
    try{const data=await api('me');if(!data.user.permissions?.includes('dashboard.view'))throw new Error('This account does not have staff access.');enterApp(data.user)}catch(error){if(error.status&&error.status!==401)$('#adminLoginMessage').textContent=error.message;leaveApp()}
  }

  $('#adminLoginForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');const message=$('#adminLoginMessage');button.disabled=true;button.textContent='Signing In…';message.textContent='';try{const data=await api('login',{method:'POST',body:Object.fromEntries(new FormData(form))});if(!data.user.permissions?.includes('dashboard.view')){await api('logout',{method:'POST'});throw new Error('This account does not have staff access.')}enterApp(data.user)}catch(error){message.textContent=error.message}finally{button.disabled=false;button.textContent='Sign In'}});
  $('#adminLogout').addEventListener('click',async()=>{try{await api('logout',{method:'POST'})}catch{}leaveApp()});
  $('#sidebarToggle').addEventListener('click',()=>$('#adminSidebar').classList.toggle('open'));
  $$('#adminNav button').forEach(btn=>btn.addEventListener('click',()=>openSection(btn.dataset.section)));
  $$('[data-open-section]').forEach(btn=>btn.addEventListener('click',()=>openSection(btn.dataset.openSection)));
  $('#refreshSection').addEventListener('click',()=>openSection(currentSection,true));

  function activateView(id){$$('.admin-view').forEach(view=>view.classList.remove('active'));$(id).classList.add('active')}
  async function openSection(section,force=false){
    if(section!=='dashboard'&&section!=='discord'&&section!=='settings'&&!sections[section])return;
    const permission=section==='dashboard'?'dashboard.view':section==='discord'?'discord.sync':section==='settings'?'settings.manage':sections[section].permission;
    if(permission&&!hasPermission(permission))return toast('Permission denied');
    currentSection=section;$$('#adminNav button').forEach(btn=>btn.classList.toggle('active',btn.dataset.section===section));$('#adminSidebar').classList.remove('open');
    if(section==='dashboard'){activateView('#dashboardView');$('#sectionEyebrow').textContent='ADMINISTRATION OVERVIEW';$('#adminSectionTitle').textContent='Dashboard';await loadDashboard();return}
    if(section==='discord'){activateView('#discordView');$('#sectionEyebrow').textContent='DISCORD INTEGRATION';$('#adminSectionTitle').textContent='Discord Sync';return}
    if(section==='settings'){activateView('#settingsView');$('#sectionEyebrow').textContent='SYSTEM CONFIGURATION';$('#adminSectionTitle').textContent='Settings';await loadSettings();return}
    activateView('#dataView');const config=sections[section];$('#sectionEyebrow').textContent=config.eyebrow;$('#adminSectionTitle').textContent=config.title;$('#addRecord').hidden=Boolean(config.addDisabled);$('#exportSection').hidden=false;$('#adminSearch').value='';await loadEntity(section,force);
  }

  async function loadDashboard(){
    try{const data=await api('admin-dashboard');const metrics=[['MEMBERS',data.counts.members,'Registered profiles'],['ACCOUNTS',data.counts.accounts,'Login accounts'],['PENDING',data.counts.pendingApplications,'Applications waiting'],['ANNOUNCEMENTS',data.counts.announcements,'Currently published'],['DEPARTMENTS',data.counts.departments,'Configured departments'],['EVENTS',data.counts.events,'Published events'],['IMAGES',data.counts.images,'Featured images']];
      $('#metricGrid').innerHTML=metrics.map(([label,count,note])=>`<article class="metric"><span>${label}</span><strong>${count}</strong><small>${note}</small></article>`).join('');
      renderDashboardList('#dashboardApplications',data.recentApplications,item=>({title:item.discord||'Unknown applicant',note:`${item.applicationType||'Application'} · ${item.fivem||'No CFX name'}`,status:item.status||'Pending'}));
      renderDashboardList('#dashboardAudit',data.recentAudit,item=>({title:item.actorName||'System',note:item.action||'Activity',status:formatValue('at',item.at)}));
    }catch(error){toast(error.message)}
  }
  function renderDashboardList(selector,items,map){const container=$(selector);if(!items?.length){container.innerHTML='<div class="dashboard-row"><div><strong>No recent activity</strong><small>New records will appear here.</small></div></div>';return}container.innerHTML='';items.forEach(item=>{const v=map(item);const row=document.createElement('div');row.className='dashboard-row';const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=v.title;const small=document.createElement('small');small.textContent=v.note;copy.append(strong,small);const status=document.createElement('span');status.textContent=v.status;row.append(copy,status);container.append(row)})}

  async function loadReferences(){
    const tasks=[];
    if(hasPermission('roles.manage')||hasPermission('users.manage')||hasPermission('members.manage')){
      tasks.push(api('admin-list',{query:{entity:'roles'}}).then(d=>referenceData.roles=Array.isArray(d.items)?d.items:[]));
    }
    if(hasPermission('members.manage')||hasPermission('users.manage')){
      tasks.push(api('admin-list',{query:{entity:'members'}}).then(d=>referenceData.members=Array.isArray(d.items)?d.items:[]));
    }
    if(hasPermission('departments.manage')||hasPermission('members.manage')||hasPermission('roles.manage')){
      tasks.push(api('admin-list',{query:{entity:'departments'}}).then(d=>referenceData.departments=Array.isArray(d.items)?d.items:[]));
    }
    await Promise.all(tasks);
  }

  async function loadEntity(entity){
    try{const data=await api('admin-list',{query:{entity}});currentItems=Array.isArray(data.items)?data.items:[];filteredItems=[...currentItems];if(['users','members','roles'].includes(entity))await loadReferences();renderTable()}catch(error){currentItems=[];filteredItems=[];renderTable();toast(error.message)}
  }

  function renderTable(){
    const config=sections[currentSection];const head=$('#dataHead');const body=$('#dataBody');head.innerHTML='';body.innerHTML='';const row=document.createElement('tr');config.columns.forEach(([,label])=>{const th=document.createElement('th');th.textContent=label;row.append(th)});const actionTh=document.createElement('th');actionTh.textContent='Actions';row.append(actionTh);head.append(row);
    filteredItems.forEach(item=>{const tr=document.createElement('tr');config.columns.forEach(([key])=>{const td=document.createElement('td');const value=formatValue(key,item[key]);if(key===config.columns[0][0]){const strong=document.createElement('strong');strong.textContent=value;td.append(strong)}else if(['status','published','active','open','pinned','roleMode','departmentMode'].includes(key)){const badge=document.createElement('span');badge.className='status-badge';badge.textContent=value;td.append(badge)}else{td.textContent=value}tr.append(td)});const actions=document.createElement('td');actions.className='table-actions';if(!config.editDisabled){const edit=document.createElement('button');edit.textContent=currentSection==='applications'?'Review':'Edit';edit.addEventListener('click',()=>openEditor(item));actions.append(edit)}if(!config.deleteDisabled){const del=document.createElement('button');del.className='delete';del.textContent='Delete';del.addEventListener('click',()=>deleteRecord(item));actions.append(del)}tr.append(actions);body.append(tr)});
    $('#dataEmpty').hidden=filteredItems.length>0;$('.table-wrap').hidden=filteredItems.length===0;
  }

  let searchTimer=0;
  $('#adminSearch').addEventListener('input',event=>{const value=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const query=value.toLowerCase().trim();filteredItems=query?currentItems.filter(item=>JSON.stringify(item).toLowerCase().includes(query)):[...currentItems];renderTable()},140)});
  $('#addRecord').addEventListener('click',()=>openEditor(null));
  $('#exportSection').addEventListener('click',()=>download(`blackstone-${currentSection}-${new Date().toISOString().slice(0,10)}.json`,currentItems));

  function fieldElement(field,item){
    const value=item?.[field.name]??field.default??'';
    if(field.type==='readonly'||field.type==='readonly-long'){const block=document.createElement('div');block.className=`read-only-block${field.full?' full':''}`;const label=document.createElement('span');label.textContent=field.label;const content=document.createElement('strong');content.textContent=formatValue(field.name,value);block.append(label,content);return block}
    if(field.type==='permissions'){const wrap=document.createElement('div');wrap.className='permission-grid';ALL_PERMISSIONS.forEach(permission=>{const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.name='permissions';input.value=permission;input.checked=Array.isArray(value)&&value.includes(permission);label.append(input,document.createTextNode(permission));wrap.append(label)});return wrap}
    if(field.type==='checkbox'){const label=document.createElement('label');label.className=`check-field${field.full?' full':''}`;const input=document.createElement('input');input.type='checkbox';input.name=field.name;input.checked=Boolean(value);label.append(input,document.createTextNode(field.label));return label}
    const label=document.createElement('label');if(field.full)label.classList.add('full');const span=document.createElement('span');span.textContent=field.label;label.append(span);let input;
    if(field.type==='textarea'){input=document.createElement('textarea');input.value=Array.isArray(value)?value.join('\n'):value}
    else if(field.type==='select'||field.type==='roleSelect'||field.type==='memberSelect'||field.type==='departmentSelect'){input=document.createElement('select');const empty=document.createElement('option');empty.value='';empty.textContent='Select…';input.append(empty);let options=field.options||[];if(field.type==='roleSelect')options=referenceData.roles.map(r=>({value:r.id,label:r.name}));if(field.type==='memberSelect')options=referenceData.members.map(m=>({value:m.id,label:m.displayName}));if(field.type==='departmentSelect')options=referenceData.departments.map(d=>({value:d.name,label:d.name}));options.forEach(option=>{const data=typeof option==='string'?{value:option,label:option}:option;const el=document.createElement('option');el.value=data.value;el.textContent=data.label;el.selected=String(data.value)===String(value);input.append(el)})}
    else{input=document.createElement('input');input.type=field.type||'text';if(field.type==='datetime-local'&&value){const d=new Date(value);input.value=Number.isNaN(d.getTime())?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}else input.value=value}
    input.name=field.name;if(field.required)input.required=true;if(field.type==='password')input.autocomplete='new-password';label.append(input);if(field.help){const help=document.createElement('small');help.textContent=field.help;label.append(help)}return label;
  }

  async function openEditor(item){
    const config=sections[currentSection];if(['users','members','roles'].includes(currentSection))await loadReferences();$('#editorEyebrow').textContent=item?'EDIT RECORD':'CREATE RECORD';$('#editorTitle').textContent=item?(item.title||item.displayName||item.name||item.discord||config.title):`New ${config.title.replace(/s$/,'')}`;const fields=$('#editorFields');fields.innerHTML='';config.fields.forEach(field=>fields.append(fieldElement(field,item)));const form=$('#editorForm');form.dataset.id=item?.id||'';$('#editorMessage').textContent='';$('#editorModal').classList.add('open');$('#editorModal').setAttribute('aria-hidden','false')
  }
  function closeEditor(){$('#editorModal').classList.remove('open');$('#editorModal').setAttribute('aria-hidden','true')}
  $$('[data-close-editor]').forEach(btn=>btn.addEventListener('click',closeEditor));

  $('#editorForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));data.id=form.dataset.id||undefined;const config=sections[currentSection];config.fields.forEach(field=>{if(field.type==='checkbox')data[field.name]=form.elements[field.name]?.checked||false;if(field.type==='permissions')data.permissions=[...form.querySelectorAll('input[name="permissions"]:checked')].map(input=>input.value);if(field.type==='datetime-local'&&data[field.name])data[field.name]=new Date(data[field.name]).toISOString()});const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Saving…';try{const result=await api('admin-save',{method:'POST',body:{entity:currentSection,item:data}});closeEditor();toast(result.warning||'Changes saved');await loadEntity(currentSection);if(currentSection==='roles')configureNavigation()}catch(error){$('#editorMessage').textContent=error.message}finally{button.disabled=false;button.textContent='Save Changes'}});

  async function deleteRecord(item){if(!confirm(`Delete ${item.title||item.displayName||item.name||item.discord||'this record'}? This cannot be undone.`))return;try{const result=await api('admin-delete',{method:'DELETE',body:{entity:currentSection,id:item.id}});toast(result.warning||'Record deleted');await loadEntity(currentSection)}catch(error){toast(error.message)}}

  $('#syncDiscord').addEventListener('click',async()=>{const button=$('#syncDiscord');button.disabled=true;button.textContent='Syncing…';$('#discordResult').textContent='Connecting to Discord, importing members and preserving manual role assignments…';try{const data=await api('discord-sync',{method:'POST'});$('#discordResult').textContent=JSON.stringify(data.result,null,2);toast('Discord sync complete')}catch(error){$('#discordResult').textContent=error.message;toast('Discord sync failed')}finally{button.disabled=false;button.textContent='Run Discord Sync'}});

  async function loadSettings(){try{const data=await api('admin-list',{query:{entity:'settings'}});const settings=data.items||{};const form=$('#communitySettingsForm');Object.entries(settings).forEach(([key,value])=>{const control=form.elements[key];if(!control)return;if(control.type==='checkbox')control.checked=Boolean(value);else control.value=value??''})}catch(error){toast(error.message)}}
  $('#communitySettingsForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const item=Object.fromEntries(new FormData(form));item.applicationsOpen=form.elements.applicationsOpen.checked;try{await api('admin-save',{method:'POST',body:{entity:'settings',item}});toast('Settings saved')}catch(error){toast(error.message)}});
  $('#passwordForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));const message=$('#passwordMessage');if(data.newPassword!==data.confirmPassword){message.textContent='New passwords do not match.';return}try{await api('change-password',{method:'POST',body:{currentPassword:data.currentPassword,newPassword:data.newPassword}});message.textContent='Password updated successfully.';form.reset()}catch(error){message.textContent=error.message}});
  $('#exportAll').addEventListener('click',async()=>{try{const data=await api('admin-export');download(`blackstone-admin-export-${new Date().toISOString().slice(0,10)}.json`,data);toast('Export downloaded')}catch(error){toast(error.message)}});

  checkSetup();restoreSession();
})();
