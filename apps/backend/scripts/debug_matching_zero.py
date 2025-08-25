from app.services.matching_service import MatchingService, MatchingWeights

svc = MatchingService.__new__(MatchingService)
svc.weights = MatchingWeights()
components = {
  'skill_overlap': 0.0,
  'keyword_coverage': 0.0,
  'experience_relevance': 0.0,
  'project_relevance': 0.0,
  'education_bonus': 0.0,
  'penalty_missing_critical': 0.0,
  'semantic_similarity': 0.0,
}
print(components)
print(svc._aggregate(components))
