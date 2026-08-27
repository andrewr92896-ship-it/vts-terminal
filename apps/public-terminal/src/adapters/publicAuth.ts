const user:any={id:'public-evidence-user',username:'public-user',displayName:'Andrew',email:'public-user@example.com',displayTimezone:null,isDemo:false,roles:['member'],access:{readOnlyWorkspaces:[],membership:{tier:'premium'},features:{advancedTrading:true,fundedAccount:false},reviews:[]}};
export function useAuth(){return {user,loading:false,refreshUser:async()=>user,logout:async()=>{}};}
