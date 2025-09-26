import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Star, Heart, Shield, Clock, Zap } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// EDS symptom options for reviews
const EDS_SYMPTOMS = [
  "Joint hypermobility",
  "Joint dislocations",
  "Chronic pain",
  "Fatigue",
  "POTS/Dysautonomia", 
  "Gastroparesis",
  "Skin hyperextensibility",
  "Easy bruising",
  "Wound healing issues",
  "Sleep disorders",
  "Anxiety/Depression",
  "Brain fog",
  "Migraines"
];

const reviewFormSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  orderId: z.string().optional(),
  reviewTitle: z.string().min(5, "Review title must be at least 5 characters").max(100, "Review title must be less than 100 characters"),
  reviewText: z.string().min(20, "Review must be at least 20 characters").max(2000, "Review must be less than 2000 characters"),
  prosText: z.string().max(500, "Pros must be less than 500 characters").optional(),
  consText: z.string().max(500, "Cons must be less than 500 characters").optional(),
  overallRating: z.number().min(1, "Please provide an overall rating").max(5),
  edsHelpfulness: z.number().min(1, "Please rate EDS helpfulness").max(5),
  comfortRating: z.number().min(1, "Please rate comfort").max(5), 
  durabilityRating: z.number().min(1, "Please rate durability").max(5),
  symptomReliefRating: z.number().min(1, "Please rate symptom relief").max(5),
  recommendToEdsPatients: z.boolean(),
  specificEdsSymptoms: z.array(z.string()).min(1, "Please select at least one symptom this product affects"),
  dailyUseContext: z.string().max(300, "Daily use context must be less than 300 characters").optional(),
});

type ReviewFormData = z.infer<typeof reviewFormSchema>;

interface ProductReviewFormProps {
  productId: string;
  productName: string;
  orderId?: string;
  onClose?: () => void;
}

function StarRating({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`p-1 hover:scale-110 transition-transform ${
              star <= value ? "text-yellow-500" : "text-gray-300"
            }`}
            data-testid={`star-${star}-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Star className="w-6 h-6 fill-current" />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value <= 2 ? "Poor" : value <= 3 ? "Fair" : value <= 4 ? "Good" : "Excellent"}
      </p>
    </div>
  );
}

export default function ProductReviewForm({ 
  productId, 
  productName, 
  orderId, 
  onClose 
}: ProductReviewFormProps) {
  const { toast } = useToast();
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      productId,
      orderId: orderId || undefined,
      reviewTitle: "",
      reviewText: "",
      prosText: "",
      consText: "",
      overallRating: 3,
      edsHelpfulness: 3,
      comfortRating: 3,
      durabilityRating: 3,
      symptomReliefRating: 3,
      recommendToEdsPatients: true,
      specificEdsSymptoms: [],
      dailyUseContext: "",
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: async (data: ReviewFormData) => {
      const response = await apiRequest("POST", "/api/reviews", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to submit review");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews", productId] });
      toast({
        title: "Review Submitted!",
        description: "Thank you for your EDS-focused feedback. Your review will be published after moderation.",
      });
      form.reset();
      if (onClose) onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit your review. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSymptomToggle = (symptom: string, checked: boolean) => {
    const updatedSymptoms = checked
      ? [...selectedSymptoms, symptom]
      : selectedSymptoms.filter(s => s !== symptom);
    
    setSelectedSymptoms(updatedSymptoms);
    form.setValue("specificEdsSymptoms", updatedSymptoms);
  };

  const onSubmit = (data: ReviewFormData) => {
    submitReviewMutation.mutate(data);
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-pink-500" />
          Review: {productName}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Share your experience with this product to help other EDS patients make informed decisions.
        </p>
      </CardHeader>
      
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Basic Review Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="reviewTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Review Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Summarize your experience..." 
                        {...field}
                        data-testid="input-review-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reviewText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Detailed Review</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell other EDS patients about your experience with this product. How did it help? Any challenges?"
                      className="min-h-32"
                      {...field}
                      data-testid="textarea-review-text"
                    />
                  </FormControl>
                  <FormDescription>
                    Share specific details about how this product affected your EDS symptoms and daily life.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* EDS-Specific Ratings */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                EDS-Focused Ratings
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="overallRating"
                  render={({ field }) => (
                    <FormItem>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        label="Overall Rating"
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="edsHelpfulness"
                  render={({ field }) => (
                    <FormItem>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        label="EDS Helpfulness"
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="symptomReliefRating"
                  render={({ field }) => (
                    <FormItem>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        label="Symptom Relief"
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comfortRating"
                  render={({ field }) => (
                    <FormItem>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        label="Comfort"
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="durabilityRating"
                  render={({ field }) => (
                    <FormItem>
                      <StarRating
                        value={field.value}
                        onChange={field.onChange}
                        label="Durability"
                      />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* EDS Symptoms */}
            <FormField
              control={form.control}
              name="specificEdsSymptoms"
              render={() => (
                <FormItem>
                  <FormLabel className="text-base font-semibold flex items-center gap-2">
                    <Zap className="w-5 h-5 text-orange-500" />
                    Which EDS symptoms does this product help with?
                  </FormLabel>
                  <FormDescription>
                    Select all symptoms that this product has positively impacted.
                  </FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                    {EDS_SYMPTOMS.map((symptom) => (
                      <div key={symptom} className="flex items-center space-x-2">
                        <Checkbox
                          id={symptom}
                          checked={selectedSymptoms.includes(symptom)}
                          onCheckedChange={(checked) => handleSymptomToggle(symptom, !!checked)}
                          data-testid={`checkbox-symptom-${symptom.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                        />
                        <label
                          htmlFor={symptom}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {symptom}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pros and Cons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="prosText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What you liked</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What worked well? What benefits did you experience?"
                        className="min-h-24"
                        {...field}
                        data-testid="textarea-pros"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="consText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What could be better</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any challenges or areas for improvement?"
                        className="min-h-24"
                        {...field}
                        data-testid="textarea-cons"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Additional Context */}
            <FormField
              control={form.control}
              name="dailyUseContext"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Daily Use Context (Optional)
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="How do you use this product daily? Any specific routines or situations where it's most helpful?"
                      className="min-h-20"
                      {...field}
                      data-testid="textarea-daily-use"
                    />
                  </FormControl>
                  <FormDescription>
                    Help other patients understand how this product fits into daily EDS management.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Recommendation */}
            <FormField
              control={form.control}
              name="recommendToEdsPatients"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-recommend"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I would recommend this product to other EDS patients
                    </FormLabel>
                    <FormDescription>
                      Based on your experience, would you suggest this product to others in the EDS community?
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* Submit Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              {onClose && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={submitReviewMutation.isPending}
                  data-testid="button-cancel-review"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={submitReviewMutation.isPending}
                data-testid="button-submit-review"
              >
                {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}