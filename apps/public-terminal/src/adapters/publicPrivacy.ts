import { useState } from 'react';
export function usePrivacy(){const [privacy,setPrivacy]=useState(false);return {privacy,toggle:()=>setPrivacy((value)=>!value)};}
