import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAdminLogin } from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert } from "lucide-react";

const loginSchema = z.object({
  pin: z.string().length(4, "PIN must be 4 digits").regex(/^\d+$/, "PIN must be numeric"),
});

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { setAdminKey } = useAdminAuth();
  const { toast } = useToast();
  const loginMutation = useAdminLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      pin: "",
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setAdminKey(data.adminKey);
          setLocation("/admin/dashboard");
        },
        onError: (error: any) => {
          toast({
            title: "Access Denied",
            description: error.message || "Invalid Admin PIN",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-destructive/10 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />
      </div>

      <div className="z-10 w-full max-w-sm p-8">
        <div className="text-center mb-10 flex flex-col items-center">
          <ShieldAlert className="w-16 h-16 text-destructive mb-4 drop-shadow-[0_0_15px_rgba(255,0,0,0.5)]" />
          <h1 className="text-3xl font-bold tracking-tighter text-white">
            ADMIN TERMINAL
          </h1>
          <p className="mt-2 text-destructive/80 text-sm uppercase tracking-widest font-mono">
            Restricted Access
          </p>
        </div>

        <div className="bg-card/40 border border-destructive/20 rounded-xl p-8 backdrop-blur-md">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-destructive/80 text-xs font-mono uppercase tracking-wider text-center block w-full">Admin Passcode</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        className="bg-black/50 border-destructive/30 text-destructive placeholder:text-destructive/20 h-16 text-center text-4xl tracking-[0.5em] focus-visible:ring-destructive focus-visible:border-destructive transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-center" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full h-14 text-base font-bold tracking-widest uppercase bg-destructive hover:bg-destructive/90 text-white shadow-[0_0_15px_rgba(255,0,0,0.3)] transition-all"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  "Authenticate"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
