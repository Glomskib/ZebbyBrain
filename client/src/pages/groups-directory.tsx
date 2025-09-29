import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Lock, Globe, Search, Heart, TrendingUp, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

interface Group {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  memberCount: number;
  category: string | null;
  tags: string[];
  createdAt: Date;
}

export default function GroupsDirectory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Fetch all public groups
  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups/public"],
  });

  // Fetch user's groups (if authenticated)
  const { data: myGroups } = useQuery<any[]>({
    queryKey: ["/api/groups/my-groups"],
  });

  // Build membership status map
  const membershipByGroup = new Map();
  myGroups?.forEach((group) => {
    membershipByGroup.set(group.id, group.membership);
  });

  // Filter groups based on search and category
  const filteredGroups = groups?.filter((group) => {
    const matchesSearch =
      searchQuery === "" ||
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || group.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(
    new Set(groups?.map((g) => g.category).filter(Boolean))
  );

  // Suggested groups (top 3 by member count) - clone before sorting
  const suggestedGroups = groups
    ? [...groups]
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 3)
    : [];

  // Trending groups (recently created with decent member count) - clone before sorting
  const trendingGroups = groups
    ? [...groups]
        .filter((g) => g.memberCount >= 2)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 3)
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          <h1 className="text-3xl font-bold mb-2" data-testid="heading-groups-directory">
            Zebby Social
          </h1>
          <p className="text-muted-foreground" data-testid="text-subtitle">
            Connect with others who understand your journey with EDS and rare conditions
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Search and Categories */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-groups"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("all")}
              data-testid="button-category-all"
            >
              All Groups
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category!)}
                data-testid={`button-category-${category}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="discover" className="space-y-6">
          <TabsList data-testid="tabs-groups">
            <TabsTrigger value="discover" data-testid="tab-discover">
              <Sparkles className="h-4 w-4 mr-2" />
              Discover
            </TabsTrigger>
            <TabsTrigger value="suggested" data-testid="tab-suggested">
              <Heart className="h-4 w-4 mr-2" />
              Suggested
            </TabsTrigger>
            <TabsTrigger value="trending" data-testid="tab-trending">
              <TrendingUp className="h-4 w-4 mr-2" />
              Trending
            </TabsTrigger>
          </TabsList>

          {/* Discover Tab */}
          <TabsContent value="discover" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-10 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredGroups && filteredGroups.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    membership={membershipByGroup.get(group.id)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground" data-testid="text-no-groups">
                    No groups found. Try adjusting your search.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Suggested Tab */}
          <TabsContent value="suggested" className="space-y-4">
            {suggestedGroups && suggestedGroups.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {suggestedGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    membership={membershipByGroup.get(group.id)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No suggested groups yet.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Trending Tab */}
          <TabsContent value="trending" className="space-y-4">
            {trendingGroups && trendingGroups.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trendingGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    membership={membershipByGroup.get(group.id)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No trending groups yet.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GroupCard({ group, membership }: { group: Group; membership?: { joinStatus: string; role: string } }) {
  const isApprovedMember = membership?.joinStatus === 'approved';
  const isPendingMember = membership?.joinStatus === 'pending';
  return (
    <Card className="hover:shadow-lg transition-shadow" data-testid={`card-group-${group.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2" data-testid={`text-group-name-${group.id}`}>
              {group.visibility === "private" ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              {group.name}
            </CardTitle>
            <CardDescription className="mt-2 line-clamp-2" data-testid={`text-group-description-${group.id}`}>
              {group.description || "No description"}
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
          <Users className="h-4 w-4" />
          <span data-testid={`text-member-count-${group.id}`}>{group.memberCount} members</span>
        </div>

        {group.category && (
          <Badge variant="secondary" className="mt-2 w-fit" data-testid={`badge-category-${group.id}`}>
            {group.category}
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {isApprovedMember ? (
          <Link href={`/groups/${group.slug}`}>
            <Button className="w-full" data-testid={`button-view-group-${group.id}`}>
              View Group
            </Button>
          </Link>
        ) : isPendingMember ? (
          <Button variant="outline" className="w-full" disabled data-testid={`button-pending-${group.id}`}>
            Pending Approval
          </Button>
        ) : (
          <Link href={`/groups/${group.slug}`}>
            <Button variant="outline" className="w-full" data-testid={`button-join-group-${group.id}`}>
              {group.visibility === "private" ? "Request to Join" : "Join Group"}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
