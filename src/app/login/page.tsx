"use client";

import { useState, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LoginPage() {
    const router = useRouter();
    const { t, language } = useLanguage();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const submitLock = useRef(false);  // 防极速双击

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitLock.current) return;  // 双重锁防重复提交
        submitLock.current = true;
        setLoading(true);
        setError("");

        const t0 = performance.now();
        if (process.env.NODE_ENV === "development") {
            console.log("[login-timing] signIn start");
        }

        try {
            const result = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (process.env.NODE_ENV === "development") {
                console.log(`[login-timing] signIn took ${(performance.now() - t0).toFixed(0)}ms`);
            }

            if (result?.error) {
                setError(t.auth?.login?.failed || 'Login failed');
                submitLock.current = false;  // 失败后允许重试
            } else {
                if (process.env.NODE_ENV === "development") {
                    console.log('[login-timing] router.push("/nana") called');
                }
                router.push("/nana");
                router.refresh();
            }
        } catch (error) {
            setError(t.auth?.login?.error || 'An error occurred');
            submitLock.current = false;  // 异常后允许重试
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">
                        {t.auth?.login?.title || 'Login'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium">
                                {t.auth?.email || 'Email'}
                            </label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium">
                                {t.auth?.password || 'Password'}
                            </label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && (
                            <div className="text-red-500 text-sm text-center">{error}</div>
                        )}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading
                                ? "正在进入…"
                                : (t.auth?.login?.action || 'Login')}
                        </Button>
                        <div className="text-center text-sm text-muted-foreground">
                            {t.auth?.login?.noAccount || "Don't have an account? "}
                            <Link href="/register" className="text-primary hover:underline">
                                {t.auth?.login?.registerNow || 'Register now'}
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
