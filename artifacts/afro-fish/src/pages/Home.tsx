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
import { usePlayerLogin } from "@workspace/api-client-react";
import { usePlayerAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pin: z.string().length(4, "PIN must be 4 digits").regex(/^\d+$/, "PIN must be numeric"),
});

export default function Home() {
  const [, setLocation] = useLocation();
  const { setSessionToken } = usePlayerAuth();
  const { toast } = useToast();
  const loginMutation = usePlayerLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      name: "",
      pin: "",
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setSessionToken(data.sessionToken);
          setLocation("/lobby");
        },
        onError: (error: any) => {
          toast({
            title: "Login Failed",
            description: error.message || "Invalid name or PIN",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
      </div>

      <div className="z-10 w-full max-w-md p-8">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-primary via-yellow-300 to-orange-500 drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]">
            AFRO FISH/S
          </h1>
          <p className="mt-3 text-muted-foreground text-lg uppercase tracking-widest font-mono">
            Arcade Gaming Platform
          </p>
        </div>

        <div className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative">
          <div className="absolute inset-0 rounded-3xl border border-white/5 shadow-[inset_0_0_30px_rgba(255,255,255,0.02)] pointer-events-none" />
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 relative z-10">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs font-mono uppercase tracking-wider">Player Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ENTER NAME"
                        className="bg-black/50 border-white/10 text-white placeholder:text-white/20 h-14 text-lg font-mono focus-visible:ring-primary focus-visible:border-primary transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs font-mono uppercase tracking-wider">4-Digit PIN</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        className="bg-black/50 border-white/10 text-white placeholder:text-white/20 h-14 text-center text-2xl tracking-[1em] focus-visible:ring-primary focus-visible:border-primary transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full h-16 text-lg font-bold tracking-widest uppercase bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-black shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)] transition-all"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  "Insert Coin (Login)"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
