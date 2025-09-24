import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <span className="text-xl">🦓</span>
              </div>
              <h1 className="text-xl font-bold text-foreground">Zebby</h1>
            </div>
            
            <Button 
              onClick={handleLogin}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="button-login"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="zebra-pattern absolute inset-0 opacity-10"></div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="w-32 h-32 mx-auto mb-8 floating-animation">
              <div className="w-full h-full bg-primary rounded-full p-6 shadow-lg glass-effect">
                <div className="text-8xl">🦓</div>
              </div>
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
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-3"
                data-testid="button-start-journey"
              >
                Start Your Journey
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="border-border text-foreground hover:bg-muted text-lg px-8 py-3"
                data-testid="button-learn-more"
              >
                Learn More
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
              <Card className="text-center">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🦓</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-3">AI Companion</h3>
                  <p className="text-muted-foreground">
                    Zebby provides empathetic reflections on your symptoms, 
                    making you feel heard and validated every day.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📊</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-3">Smart Tracking</h3>
                  <p className="text-muted-foreground">
                    Log symptoms easily and discover patterns that help you 
                    understand your body better.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🛍️</span>
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
              className="bg-white text-primary hover:bg-white/90 text-lg px-8 py-3"
              data-testid="button-join-now"
            >
              Join Zebby Today
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-sm">🦓</span>
            </div>
            <span className="font-semibold text-foreground">Zebby</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Made with ❤️ for the EDS community. You are understood here.
          </p>
        </div>
      </footer>
    </div>
  );
}
