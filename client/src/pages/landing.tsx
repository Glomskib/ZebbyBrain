import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ZebbyAvatar from "@/components/zebby-avatar";
import { BarChart3, ShoppingBag, Heart } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen sky-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <ZebbyAvatar size="small" followUser={false} />
              <h1 className="text-xl font-bold text-foreground">Zebby's World</h1>
            </div>
            
            <Button
              onClick={handleLogin}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-5"
              data-testid="button-login"
            >
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="zebra-pattern absolute inset-0 opacity-10"></div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="mx-auto mb-8">
              <ZebbyAvatar size="large" className="mx-auto" />
            </div>
            
            <h1 className="text-5xl font-bold text-foreground mb-6">
              You Are <span className="text-primary">Understood</span> Here
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Track your symptoms, connect with Zebby your AI companion, and find 
              the support you need for your EDS journey. Join a community that truly gets it.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={handleLogin}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-3 rounded-full"
                data-testid="button-start-journey"
              >
                Start your journey
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => { window.location.href = "/signup"; }}
                className="border-border text-foreground hover:bg-muted text-lg px-8 py-3 rounded-full"
                data-testid="button-learn-more"
              >
                Create account
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-foreground mb-12">
              Everything You Need in One Place
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="text-center rounded-3xl border-0 shadow-zebby">
                <CardContent className="p-6 md:p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ZebbyAvatar size="small" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">AI Companion</h3>
                  <p className="text-muted-foreground">
                    Zebby provides empathetic reflections on your symptoms, 
                    making you feel heard and validated every day.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center rounded-3xl border-0 shadow-zebby">
                <CardContent className="p-6 md:p-8">
                  <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-8 h-8 text-accent" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">Smart Tracking</h3>
                  <p className="text-muted-foreground">
                    Log symptoms easily and discover patterns that help you 
                    understand your body better.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center rounded-3xl border-0 shadow-zebby">
                <CardContent className="p-6 md:p-8">
                  <div className="w-16 h-16 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ShoppingBag className="w-8 h-8 text-secondary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">EDS Marketplace</h3>
                  <p className="text-muted-foreground">
                    Access curated products with exclusive discounts - 
                    from braces to supplements to courses.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-gradient-to-r from-primary to-secondary py-16 px-4 sm:px-6 lg:px-8 text-white relative overflow-hidden">
          <div className="zebra-pattern absolute inset-0 opacity-20"></div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Feel Understood?
            </h2>
            <p className="text-xl mb-8 text-white/90">
              Join thousands of others who have found validation, support, and community with Zebby.
            </p>
            <Button
              size="lg"
              onClick={handleLogin}
              className="bg-white text-primary hover:bg-white/90 text-lg px-8 py-3 rounded-full"
              data-testid="button-join-now"
            >
              Join Zebby's World today
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ZebbyAvatar size="small" />
            <span className="font-semibold text-foreground">Zebby's World</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Made with <Heart className="inline w-4 h-4 text-red-500 mx-1" /> for the EDS community. You are understood here.
          </p>
        </div>
      </footer>
    </div>
  );
}
