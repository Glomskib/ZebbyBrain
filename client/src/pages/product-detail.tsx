import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import ProductReviewForm from "@/components/ProductReviewForm";
import ProductReviews from "@/components/ProductReviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Heart, 
  ShoppingCart, 
  ArrowLeft, 
  Star, 
  Shield, 
  DollarSign,
  MessageCircle,
  Award
} from "lucide-react";
import { Link } from "wouter";

interface ProductDetailProps {
  productId: string;
}

export default function ProductDetail({ productId }: ProductDetailProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Fetch product details
  const { data: product, isLoading: productLoading, error: productError } = useQuery({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`, { 
        credentials: "include" 
      });
      if (!response.ok) {
        throw new Error("Product not found");
      }
      return response.json();
    },
    enabled: !!productId,
    retry: false,
  });

  // Fetch reviews for rating summary
  const { data: reviews = [] } = useQuery<any[]>({
    queryKey: ["/api/reviews", productId],
    enabled: !!productId,
    retry: false,
  });

  if (productLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-96 bg-gray-200 rounded"></div>
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (productError || !product) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The product you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/marketplace">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Marketplace
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const averageRating = reviews.length > 0 
    ? reviews.reduce((sum: number, r: any) => sum + r.overallRating, 0) / reviews.length 
    : 0;

  const discountedPrice = product.originalPrice && product.discountPercentage
    ? (parseFloat(product.originalPrice) * (1 - product.discountPercentage / 100)).toFixed(2)
    : product.price;

  const handleAddToCart = async () => {
    // This would integrate with existing cart mutation
    toast({
      title: "Added to Cart",
      description: `${product.name} has been added to your cart.`,
    });
  };

  const handleToggleFavorite = async () => {
    // This would integrate with existing favorites mutation
    toast({
      title: "Added to Favorites",
      description: `${product.name} has been saved to your favorites.`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Link href="/marketplace" className="hover:text-foreground transition-colors">
            Marketplace
          </Link>
          <span>/</span>
          <span className="text-foreground">{product.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          {/* Product Image */}
          <div className="space-y-4">
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  data-testid="product-image"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Award className="w-16 h-16 mx-auto mb-4" />
                    <p>Product Image</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="product-name">
                {product.name}
              </h1>
              
              {/* Rating Summary */}
              {reviews.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-5 h-5 ${
                          star <= Math.round(averageRating)
                            ? "text-yellow-500 fill-yellow-500"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">
                    ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
                  </span>
                </div>
              )}

              <p className="text-muted-foreground leading-relaxed" data-testid="product-description">
                {product.description}
              </p>
            </div>

            {/* Pricing */}
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold" data-testid="product-price">
                  ${discountedPrice}
                </span>
                {product.originalPrice && product.discountPercentage && (
                  <>
                    <span className="text-lg text-muted-foreground line-through">
                      ${product.originalPrice}
                    </span>
                    <Badge variant="destructive">
                      {product.discountPercentage}% OFF
                    </Badge>
                  </>
                )}
              </div>
            </div>

            {/* EDS-Specific Benefits */}
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
              <CardContent className="pt-4">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  EDS-Friendly Features
                </h3>
                <p className="text-sm text-muted-foreground">
                  This product has been curated specifically for people with Ehlers-Danlos Syndrome 
                  and related conditions. Check the reviews below for EDS-specific feedback from our community.
                </p>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            {isAuthenticated && (
              <div className="flex gap-3">
                <Button 
                  className="flex-1" 
                  onClick={handleAddToCart}
                  data-testid="button-add-to-cart"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleToggleFavorite}
                  data-testid="button-favorite"
                >
                  <Heart className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Review Action */}
            {isAuthenticated && !showReviewForm && (
              <Button
                variant="outline"
                onClick={() => setShowReviewForm(true)}
                className="w-full"
                data-testid="button-write-review"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Write a Review
              </Button>
            )}
          </div>
        </div>

        <Separator className="my-12" />

        {/* Review Form */}
        {showReviewForm && (
          <div className="mb-12">
            <ProductReviewForm
              productId={productId}
              productName={product.name}
              onClose={() => setShowReviewForm(false)}
            />
          </div>
        )}

        {/* Reviews Section */}
        <ProductReviews productId={productId} />

        {/* Back to Marketplace */}
        <div className="mt-16 text-center">
          <Link href="/marketplace">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}