// Insertar datos de muestra en las tablas
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function insertSampleData() {
  console.log('🎯 Insertando datos de muestra...')
  
  try {
    // 1. Insertar proyectos
    console.log('📊 Insertando proyectos...')
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .insert([
        {
          title: 'Fintech Dashboard',
          description: 'Redesigning the core banking experience with modern UI/UX',
          progress: 75,
          status: 'Active',
          client: 'Bank Corp',
          next_steps: 'User Testing',
          color: '#3b82f6'
        },
        {
          title: 'E-commerce Platform',
          description: 'Complete online store solution with payment integration',
          progress: 45,
          status: 'Active',
          client: 'Tech Store',
          next_steps: 'Payment integration',
          color: '#10b981'
        },
        {
          title: 'Mobile App Redesign',
          description: 'Complete overhaul of mobile application',
          progress: 20,
          status: 'Pending',
          client: 'StartupXYZ',
          next_steps: 'Wireframes',
          color: '#f59e0b'
        }
      ])
      .select()
    
    if (projectsError) {
      console.log('⚠️  Error proyectos:', projectsError.message)
    } else {
      console.log(`✅ ${projects.length} proyectos insertados`)
    }
    
    // 2. Insertar ideas
    console.log('💡 Insertando ideas...')
    const { data: ideas, error: ideasError } = await supabase
      .from('ideas')
      .insert([
        {
          content: 'Explore using Framer Motion for landing page animations instead of CSS transitions',
          tags: ['Dev', 'UX'],
          integrated: false
        },
        {
          content: 'Dark mode toggle should persist via local storage but sync with system preference',
          tags: ['Dev'],
          integrated: true
        },
        {
          content: 'Write a blog post about Minimalism in SaaS Interfaces covering Linear aesthetics',
          tags: ['Marketing', 'Content'],
          integrated: false
        }
      ])
      .select()
    
    if (ideasError) {
      console.log('⚠️  Error ideas:', ideasError.message)
    } else {
      console.log(`✅ ${ideas.length} ideas insertadas`)
    }
    
    // 3. Insertar leads
    console.log('🎯 Insertando leads...')
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .insert([
        {
          name: 'Martín Gomez',
          email: 'martin.g@startup.io',
          message: 'Hi, looking for SaaS rebranding. We are launching next quarter.',
          origin: 'Web Form',
          status: 'new',
          ai_analysis: {
            category: 'branding',
            temperature: 'hot',
            summary: 'High intent SaaS launch imminent',
            recommendation: 'Send SaaS Branding Kit PDF and schedule call'
          }
        },
        {
          name: 'Sarah Lee',
          email: 'sarah@boutique.co',
          message: 'Need Shopify development for our fashion store',
          origin: 'Instagram',
          status: 'contacted',
          ai_analysis: {
            category: 'ecommerce',
            temperature: 'warm',
            summary: 'Specific need for Shopify Dev with fashion focus',
            recommendation: 'Share E-commerce portfolio and case studies'
          }
        },
        {
          name: 'TechFlow Inc',
          email: 'partners@techflow.com',
          message: 'Partnership inquiry for enterprise solutions',
          origin: 'Web Form',
          status: 'following',
          ai_analysis: {
            category: 'saas',
            temperature: 'cold',
            summary: 'Vague B2B inquiry, potential for enterprise',
            recommendation: 'Qualify via email and send enterprise deck'
          }
        }
      ])
      .select()
    
    if (leadsError) {
      console.log('⚠️  Error leads:', leadsError.message)
    } else {
      console.log(`✅ ${leads.length} leads insertados`)
    }
    
    // 4. Insertar activity logs
    console.log('📈 Insertando activity logs...')
    const { data: activities, error: activitiesError } = await supabase
      .from('activity_logs')
      .insert([
        {
          user_name: 'Sofia R.',
          user_avatar: 'SR',
          action: 'completed task',
          target: 'Hero Section Responsiveness',
          project_title: 'Fintech Dashboard',
          type: 'task_completed',
          details: 'Task completed successfully'
        },
        {
          user_name: 'Lucas M.',
          user_avatar: 'LM',
          action: 'commented on',
          target: 'API Schema V2',
          project_title: 'E-commerce Platform',
          type: 'comment',
          details: 'I think we should switch to GraphQL for the product endpoints'
        },
        {
          user_name: 'Eneas',
          user_avatar: 'E',
          action: 'uploaded files to',
          target: 'Design Assets',
          project_title: 'Fintech Dashboard',
          type: 'file_uploaded',
          details: '3 new design files uploaded'
        }
      ])
      .select()
    
    if (activitiesError) {
      console.log('⚠️  Error activity logs:', activitiesError.message)
    } else {
      console.log(`✅ ${activities.length} activity logs insertados`)
    }
    
    // 5. Insertar web analytics
    console.log('📊 Insertando web analytics...')
    const { data: analytics, error: analyticsError } = await supabase
      .from('web_analytics')
      .insert([
        {
          total_visits: 1250,
          unique_visitors: 890,
          bounce_rate: 35.2,
          conversions: 45,
          top_pages: [
            { path: '/', views: 450 },
            { path: '/portfolio', views: 320 },
            { path: '/contact', views: 180 }
          ],
          daily_visits: [
            { date: '2024-01-01', value: 120 },
            { date: '2024-01-02', value: 145 },
            { date: '2024-01-03', value: 98 }
          ]
        }
      ])
      .select()
    
    if (analyticsError) {
      console.log('⚠️  Error web analytics:', analyticsError.message)
    } else {
      console.log(`✅ ${analytics.length} registros de analytics insertados`)
    }
    
    console.log('\n🎉 ¡Datos de muestra insertados exitosamente!')
    console.log('🌐 Abre http://localhost:3000 para verlos en acción')
    
  } catch (error) {
    console.error('❌ Error insertando datos:', error)
  }
}

insertSampleData()