from rest_framework.routers import DefaultRouter
from .views import BoardViewSet, ListViewSet, CardViewSet

router = DefaultRouter()
router.register(r'boards', BoardViewSet)
router.register(r'lists', ListViewSet)
router.register(r'cards', CardViewSet)

urlpatterns = router.urls