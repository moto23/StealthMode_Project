import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import CourseCard from './CourseCard';
import { CardSkeletonGrid } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import '../css/Dashboard.css';

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'az', label: 'A–Z' },
];

function Dashboard() {
  const { user } = useContext(UserContext);
  const [courses, setCourses] = useState([]);
  const [owned, setOwned] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recommended');

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/courses');
      setCourses(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching courses:', err.response?.data || err.message);
      setError('We couldn’t load the courses. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Authoritative ownership from the backend (never localStorage).
  useEffect(() => {
    let active = true;
    if (!user) {
      setOwned(new Set());
      return undefined;
    }
    api
      .get('/api/payments/owned')
      .then((res) => active && setOwned(new Set((res.data.courseIds || []).map(String))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  const markOwned = useCallback((courseId) => {
    setOwned((prev) => new Set(prev).add(String(courseId)));
  }, []);

  // Category options derived dynamically from the catalog.
  const categories = useMemo(() => {
    const set = new Set();
    courses.forEach((c) => c.category && set.add(c.category));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [courses]);

  // Client-side search + filter + sort (18-course catalog — no server round-trips).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = courses.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      return [c.title, c.description, c.instructor, c.category]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    const price = (c) => Number(c.price) || 0;
    const date = (c) => new Date(c.registrationDate || c.createdAt || 0).getTime();
    switch (sort) {
      case 'price-asc': list = [...list].sort((a, b) => price(a) - price(b)); break;
      case 'price-desc': list = [...list].sort((a, b) => price(b) - price(a)); break;
      case 'az': list = [...list].sort((a, b) => String(a.title).localeCompare(String(b.title))); break;
      case 'newest': list = [...list].sort((a, b) => date(b) - date(a)); break;
      default: break; // 'recommended' keeps the server order
    }
    return list;
  }, [courses, query, category, sort]);

  const hasFilters = query.trim() !== '' || category !== 'all' || sort !== 'recommended';
  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    setSort('recommended');
  };

  return (
    <div className="storefront">
      <header className="storefront-hero">
        <h1>Explore Courses</h1>
        <p>Level up with industry-focused, project-based programs.</p>
      </header>

      <div className="catalog-controls">
        <div className="catalog-search">
          <span className="catalog-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, instructor, category…"
            aria-label="Search courses"
          />
        </div>
        <div className="catalog-filters">
          <label className="catalog-field">
            <span className="catalog-field-label">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
              ))}
            </select>
          </label>
          <label className="catalog-field">
            <span className="catalog-field-label">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort courses">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!loading && !error && (
        <div className="catalog-meta">
          <span>{visible.length} {visible.length === 1 ? 'course' : 'courses'}{hasFilters ? ' found' : ''}</span>
          {hasFilters && (
            <button type="button" className="catalog-clear" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      <div className="course-list">
        {loading ? (
          <CardSkeletonGrid count={8} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchCourses} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No courses match your search"
            message="Try a different keyword or clear the filters to see the full catalog."
            action={hasFilters ? (
              <button type="button" className="sm-btn sm-btn-primary" onClick={clearFilters}>Clear filters</button>
            ) : null}
          />
        ) : (
          visible.map((course) => (
            <CourseCard
              key={course._id}
              course={course}
              owned={owned.has(String(course._id))}
              onPurchased={markOwned}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default Dashboard;
