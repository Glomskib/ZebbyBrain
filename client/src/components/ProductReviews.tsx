import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Star, ThumbsUp, ThumbsDown, Shield, Heart, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProductReview {
  id: string;
  userId: string;
  productId: string;
  orderId: string | null;
  overallRating: number;
  edsHelpfulness: number;
  comfortRating: number;
  durabilityRating: number;
  symptomReliefRating: number;
  reviewTitle: string;
  reviewText: string;
  prosText: string | null;
  consText: string | null;
  recommendToEdsPatients: boolean;
  specificEdsSymptoms: string[];
  dailyUseContext: string | null;
  verifiedPurchase: boolean;
  isApproved: boolean;
  helpfulCount: number;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

interface ProductReviewsProps {
  productId: string;
}

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const starSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${starSize} ${
            star <= rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ProductReview }) {
  const reviewAge = formatDistanceToNow(new Date(review.createdAt), { addSuffix: true });
  
  const getRatingLabel = (rating: number) => {
    if (rating <= 2) return "Poor";
    if (rating <= 3) return "Fair";
    if (rating <= 4) return "Good";
    return "Excellent";
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg" data-testid={`review-title-${review.id}`}>
                {review.reviewTitle}
              </h3>
              {review.verifiedPurchase && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Verified Purchase
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span data-testid={`review-author-${review.id}`}>
                By {review.user.firstName} {review.user.lastName[0]}.
              </span>
              <span>{reviewAge}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <StarDisplay rating={review.overallRating} />
              <span className="text-sm font-medium">
                {review.overallRating}/5 - {getRatingLabel(review.overallRating)}
              </span>
            </div>
          </div>

          {review.recommendToEdsPatients && (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <Heart className="w-3 h-3 mr-1" />
              Recommends to EDS patients
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Review Text */}
        <div>
          <p className="leading-relaxed" data-testid={`review-text-${review.id}`}>
            {review.reviewText}
          </p>
        </div>

        {/* EDS-Specific Ratings */}
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
          <h4 className="font-semibold flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-blue-500" />
            EDS-Specific Ratings
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground">EDS Helpfulness</span>
              <div className="flex items-center gap-2">
                <StarDisplay rating={review.edsHelpfulness} />
                <span className="font-medium">{review.edsHelpfulness}/5</span>
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-muted-foreground">Symptom Relief</span>
              <div className="flex items-center gap-2">
                <StarDisplay rating={review.symptomReliefRating} />
                <span className="font-medium">{review.symptomReliefRating}/5</span>
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-muted-foreground">Comfort</span>
              <div className="flex items-center gap-2">
                <StarDisplay rating={review.comfortRating} />
                <span className="font-medium">{review.comfortRating}/5</span>
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-muted-foreground">Durability</span>
              <div className="flex items-center gap-2">
                <StarDisplay rating={review.durabilityRating} />
                <span className="font-medium">{review.durabilityRating}/5</span>
              </div>
            </div>
          </div>
        </div>

        {/* Affected Symptoms */}
        {review.specificEdsSymptoms && review.specificEdsSymptoms.length > 0 && (
          <div>
            <h5 className="font-medium mb-2">This product helped with:</h5>
            <div className="flex flex-wrap gap-2">
              {review.specificEdsSymptoms.map((symptom) => (
                <Badge key={symptom} variant="outline" className="text-xs">
                  {symptom}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Pros and Cons */}
        {(review.prosText || review.consText) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {review.prosText && (
              <div className="space-y-2">
                <h5 className="font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4" />
                  What worked well
                </h5>
                <p className="text-sm leading-relaxed p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  {review.prosText}
                </p>
              </div>
            )}
            
            {review.consText && (
              <div className="space-y-2">
                <h5 className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <ThumbsDown className="w-4 h-4" />
                  Could be better
                </h5>
                <p className="text-sm leading-relaxed p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  {review.consText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Daily Use Context */}
        {review.dailyUseContext && (
          <div>
            <h5 className="font-medium mb-2">Daily Use Context</h5>
            <p className="text-sm leading-relaxed p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              {review.dailyUseContext}
            </p>
          </div>
        )}

        <Separator />

        {/* Review Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" className="gap-2" data-testid={`button-helpful-${review.id}`}>
              <ThumbsUp className="w-4 h-4" />
              Helpful ({review.helpfulCount})
            </Button>
            <Button variant="outline" size="sm" className="gap-2" data-testid={`button-not-helpful-${review.id}`}>
              <ThumbsDown className="w-4 h-4" />
              Not helpful
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground">
            Review #{review.id.slice(0, 8)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductReviews({ productId }: ProductReviewsProps) {
  const { data: reviews = [], isLoading, error } = useQuery<ProductReview[]>({
    queryKey: ["/api/reviews", productId],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Customer Reviews</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Unable to load reviews at this time.</p>
      </div>
    );
  }

  const averageRating = reviews.length > 0 
    ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length 
    : 0;

  const ratingDistribution = [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: reviews.filter(r => r.overallRating === rating).length
  }));

  return (
    <div className="space-y-6" data-testid="product-reviews-section">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Customer Reviews</h2>
        {reviews.length > 0 && (
          <div className="text-right">
            <div className="flex items-center gap-2">
              <StarDisplay rating={Math.round(averageRating)} />
              <span className="font-medium">
                {averageRating.toFixed(1)} out of 5
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {reviews.length > 0 ? (
        <>
          {/* Rating Distribution */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-5 gap-4 text-center">
                {ratingDistribution.map(({ rating, count }) => (
                  <div key={rating} className="space-y-1">
                    <div className="flex items-center justify-center">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="ml-1 text-sm">{rating}</span>
                    </div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">
                      review{count !== 1 ? 's' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Individual Reviews */}
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="space-y-3">
              <Star className="w-12 h-12 text-muted-foreground mx-auto" />
              <h3 className="font-medium">No reviews yet</h3>
              <p className="text-muted-foreground">
                Be the first to review this product and help other EDS patients!
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}