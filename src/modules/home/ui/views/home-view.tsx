"use client"

import React from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function HomeView() {
  const router = useRouter();
  const {data, isPending} = authClient.useSession();

  return (
    <div>
      <p>{data?.user.name}</p>
      <Button onClick={()=>{authClient.signOut({fetchOptions: {onSuccess:()=> router.push('/auth/sign-in')}})}}>Logout</Button>
    </div>
  )
}
