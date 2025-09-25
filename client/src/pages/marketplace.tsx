import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";

export default function Marketplace() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Fetch product categories and deduplicate by name (take most recent)
  const { data: categoriesRaw = [] } = useQuery({
    queryKey: ["/api/product-categories"],
    enabled: true, // Public data
    retry: false,
  });

  // Deduplicate categories by name, keeping the most recent one
  const categories = (categoriesRaw as any[]).reduce((acc: any[], category: any) => {
    const existing = acc.find(c => c.name === category.name);
    if (!existing) {
      acc.push(category);
    } else if (new Date(category.createdAt) > new Date(existing.createdAt)) {
      // Replace with more recent category
      const index = acc.findIndex(c => c.name === category.name);
      acc[index] = category;
    }
    return acc;
  }, []);

  // Fetch products
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["/api/products", selectedCategory],
    queryFn: async () => {
      const url = selectedCategory 
        ? `/api/products?categoryId=${selectedCategory}`
        : '/api/products';
      console.log(`🔍 Fetching products from: ${url}`);
      console.log(`🔍 Selected category: ${selectedCategory}`);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log(`✅ Received ${data.length} products`);
      
      // Deduplicate products by name, keeping the most recent one
      const deduplicatedProducts = data.reduce((acc: any[], product: any) => {
        const existing = acc.find(p => p.name === product.name);
        if (!existing) {
          acc.push(product);
        } else if (new Date(product.createdAt) > new Date(existing.createdAt)) {
          // Replace with more recent product
          const index = acc.findIndex(p => p.name === product.name);
          acc[index] = product;
        }
        return acc;
      }, []);
      
      console.log(`✅ After deduplication: ${deduplicatedProducts.length} products`);
      return deduplicatedProducts;
    },
    enabled: true, // Public data
    retry: false,
  });

  // Fetch user favorites (authenticated only)
  const { data: favorites = [] } = useQuery({
    queryKey: ["/api/favorites"],
    enabled: isAuthenticated,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🛍️</span>
          </div>
          <p className="text-muted-foreground">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  const favoriteProductIds = new Set((favorites as any[]).map((f: any) => f.productId));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">EDS Marketplace</h1>
          <p className="text-muted-foreground text-lg">
            Curated products to support your EDS journey, with exclusive discounts for our community.
          </p>
        </div>
        
        {/* Category Navigation */}
        <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
          <Button
            variant={selectedCategory === undefined ? "default" : "outline"}
            onClick={() => setSelectedCategory(undefined)}
            className={selectedCategory === undefined ? "bg-primary text-primary-foreground" : ""}
            data-testid="category-all"
          >
            All Products
          </Button>
          {(categories as any[]).map((category: any) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              onClick={() => setSelectedCategory(category.id)}
              className={`whitespace-nowrap ${
                selectedCategory === category.id 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted"
              }`}
              data-testid={`category-${category.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="mr-2">{category.icon}</span>
              {category.name}
            </Button>
          ))}
        </div>
        
        {/* Products Grid */}
        {productsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading products...</p>
          </div>
        ) : (products as any[]).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {(products as any[]).map((product: any, index: number) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {product.imageUrl && (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name}
                    className="w-full h-48 object-cover"
                  />
                )}
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    {product.discountPercentage && (
                      <Badge className="bg-accent text-accent-foreground">
                        {product.discountPercentage}% OFF
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {(categories as any[]).find((c: any) => c.id === product.categoryId)?.name || 'Product'}
                    </Badge>
                  </div>
                  
                  <h3 className="font-semibold text-foreground mb-2" data-testid={`product-name-${index}`}>
                    {product.name}
                  </h3>
                  
                  <p className="text-muted-foreground text-sm mb-4" data-testid={`product-description-${index}`}>
                    {product.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-foreground" data-testid={`product-price-${index}`}>
                        ${parseFloat(product.price).toFixed(2)}
                      </span>
                      {product.originalPrice && (
                        <span className="text-sm text-muted-foreground line-through">
                          ${parseFloat(product.originalPrice).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isAuthenticated && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`${
                            favoriteProductIds.has(product.id) 
                              ? 'text-accent hover:text-accent/80' 
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          data-testid={`button-favorite-${index}`}
                        >
                          <Heart className={`w-4 h-4 ${favoriteProductIds.has(product.id) ? 'fill-current' : ''}`} />
                        </Button>
                      )}
                      <Button 
                        className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
                        data-testid={`button-add-cart-${index}`}
                      >
                        Add to Cart
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🛍️</div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              No Products Available
            </h2>
            <p className="text-muted-foreground">
              {selectedCategory 
                ? "No products found in this category. Try browsing other categories."
                : "The marketplace is being set up. Check back soon for curated EDS products!"
              }
            </p>
            {selectedCategory && (
              <Button 
                onClick={() => setSelectedCategory(undefined)}
                className="mt-4 bg-primary hover:bg-primary/90"
                data-testid="button-view-all"
              >
                View All Products
              </Button>
            )}
          </div>
        )}

        {/* Placeholder for future features */}
        {!isLoading && (categories as any[]).length === 0 && (
          <div className="bg-muted/50 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">🚧</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Marketplace Coming Soon
            </h3>
            <p className="text-muted-foreground mb-4">
              We're working hard to curate the best EDS-friendly products for our community. 
              You'll find braces, supplements, electrolytes, tools, and educational courses here soon.
            </p>
            <Button 
              onClick={() => toast({
                title: "Thanks for your interest!",
                description: "We'll notify you when the marketplace is ready.",
              })}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-notify-me"
            >
              Notify Me When Ready
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
