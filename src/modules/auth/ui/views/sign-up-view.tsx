"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { FaGithub, FaGoogle } from "react-icons/fa";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { OctagonAlertIcon, OctagonIcon } from "lucide-react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import DotGrid from "@/components/DotGrid";

const formSchema = z
  .object({
    name: z.string().min(1, { message: "Name is required" }),
    email: z.string().email(),
    password: z.string().min(1, { message: "Password is required" }),
    confirmPassword: z.string().min(1, { message: "Password is required" }),
  })
  .refine((data) => data.password == data.confirmPassword, {
    message: "Password don't match",
    path: ["confirmPassword"],
  });

export default function SignUpView() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setError(null);
    setPending(true);
    authClient.signUp.email(
      {
        name: data.name,
        email: data.email,
        password: data.password,
        callbackURL: "/",
      },
      {
        onSuccess: () => {
          setPending(false);
          router.push("/");
        },
        onError: ({ error }) => {
          setError(error.message);
        },
      }
    );
  };

  const onSocial = (provider: "google" | "github") => {
    setError(null);
    setPending(true);
    authClient.signIn.social(
      {
        provider: provider,
        callbackURL: "/",
      },
      {
        onSuccess: () => {
          setPending(false);
          // router.push('/')
        },
        onError: ({ error }) => {
          setError(error.message);
        },
      }
    );
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center gap-6 bg-neutral-900 text-white">
      <div className="absolute inset-0 z-0">
        <DotGrid
          dotSize={8}
          gap={50}
          baseColor="#39FF14"
          activeColor="#39FF14"
          proximity={120}
          shockRadius={250}
          shockStrength={5}
          resistance={750}
          returnDuration={1.5}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <Card className="relative z-10 overflow-hidden p-0 w-full max-w-5xl bg-neutral-900/90 border border-neutral-800 shadow-lg backdrop-blur">
        <CardContent className="grid p-0 md:grid-cols-2">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="p-8 md:p-12"
            >
              <div className="flex flex-col g-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-4xl font-bold text-white">Welcome!</h1>
                  <p className="text-white text-balance text-lg">
                    Create your account
                  </p>
                </div>
                {/* Enlarged inputs */}
                <div className="grid gap-3 m-1.5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-lg text-white">
                          Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="John Doe"
                            className="h-12 text-lg text-white placeholder:text-neutral-400"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-3 m-1.5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-lg text-white">
                          Email
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="me@gmail.com"
                            className="h-12 text-lg text-white placeholder:text-neutral-400"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-3 m-1.5">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-lg text-white">
                          Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="********"
                            className="h-12 text-lg text-white placeholder:text-neutral-400"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-3 m-1.5">
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-lg text-white">
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="********"
                            className="h-12 text-lg text-white placeholder:text-neutral-400"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {!!error && (
                  <Alert className="bg-destructive/10 border-none m-1.5">
                    <OctagonAlertIcon className="h-4 w-4 !text-destructive" />
                    <AlertTitle className="text-white">{error}</AlertTitle>
                  </Alert>
                )}
                <Button
                  className="w-full m-1.5 h-12 text-lg text-white"
                  type="submit"
                >
                  Sign Up
                </Button>
                <div className="m-1.5 after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                  <span className="bg-neutral-900/90 text-white relative z-10 px-2">
                    Or Continue with
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-0.5s">
                  <Button
                    className="bg-neutral-800 w-full h-12 text-lg text-white"
                    variant="outline"
                    type="button"
                    onClick={() => onSocial("google")}
                  >
                    <FaGoogle className="size-5" />
                  </Button>
                  <Button
                    className="bg-neutral-800 w-full h-12 text-lg text-white"
                    variant="outline"
                    type="button"
                    onClick={() => onSocial("github")}
                  >
                    <FaGithub className="size-5" />
                  </Button>
                </div>
                <div className="text-center text-sm text-white">
                  Already have an account?
                  <Link
                    className="underline underline-offset-4 text-white"
                    href="/auth/sign-in"
                  ></Link>
                </div>
              </div>
            </form>
          </Form>
          <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-[#39FF14] relative hidden md:flex flex-col gap-y-4 items-center justify-center h-full w-full p-6">
            <img
              src="/logo-bg.png"
              alt="logo"
              className="h-[120px] w-[120px] rounded-2xl"
            />
            <p className="text-3xl font-semibold text-white">XBase</p>
          </div>
        </CardContent>
      </Card>

      <div className="text-white *:[a]:hover:text-[#39FF14] text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4 *:[a]:text-white">
        By Clicking continue, you are going to our{" "}
        <a href="#">Terms of service</a> and <a href="#">Privay Policy</a>
      </div>
    </div>
  );
}
