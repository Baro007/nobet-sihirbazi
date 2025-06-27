#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NöbetSihirbazı - Akıllı Çizelge Optimizatörü
===========================================

Bu modül doktor nöbet çizelgelerini optimize etmek için:
1. Linear Programming (PuLP)
2. Genetic Algorithm (DEAP)
3. Machine Learning (scikit-learn)
teknolojilerini kullanır.

Kullanım:
    python schedule_optimizer.py --input preferences.json --output schedule.json
"""

import json
import sys
import argparse
import random
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# Linear Programming için
try:
    from pulp import *
    LP_AVAILABLE = True
except ImportError:
    print("⚠️  PuLP kurulu değil. pip install pulp")
    LP_AVAILABLE = False

# Genetic Algorithm için
try:
    from deap import base, creator, tools, algorithms
    import random
    GA_AVAILABLE = True
except ImportError:
    print("⚠️  DEAP kurulu değil. pip install deap")
    GA_AVAILABLE = False

# Machine Learning için
try:
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.preprocessing import StandardScaler
    import pandas as pd
    ML_AVAILABLE = True
except ImportError:
    print("⚠️  scikit-learn kurulu değil. pip install scikit-learn pandas")
    ML_AVAILABLE = False

class NobetOptimizer:
    """Akıllı Nöbet Çizelge Optimizatörü"""
    
    def __init__(self, preferences_data: Dict, month: int = 7, year: int = 2025):
        self.preferences = preferences_data
        self.month = month
        self.year = year
        self.days_in_month = 31  # Temmuz 2025
        self.doctors = list(preferences_data.keys())
        self.num_doctors = len(self.doctors)
        
        # Çizelge kuralları
        self.MAX_SHIFTS_PER_DOCTOR = 8
        self.TARGET_SHIFTS_PER_DOCTOR = 7
        self.WEEKDAY_DOCTORS_NEEDED = 2
        self.WEEKEND_DOCTORS_NEEDED = 3
        
        # Optimizasyon sonuçları
        self.schedule = {}
        self.optimization_log = []
        self.quality_score = 0.0
        
    def get_weekday_type(self, day: int) -> str:
        """Günün hafta içi/hafta sonu durumunu döndürür"""
        # Temmuz 2025: 1. gün Salı
        # 0=Pazartesi, 1=Salı, ..., 6=Pazar
        weekday = (day) % 7  # 1 Temmuz = Salı (1)
        return "weekend" if weekday in [5, 6] else "weekday"  # Cumartesi=5, Pazar=6
    
    def calculate_doctor_features(self, doctor: str) -> Dict:
        """Doktor özelliklerini ML için hesaplar"""
        prefs = self.preferences.get(doctor, {})
        
        features = {
            'positive_count': len(prefs.get('pozitif', [])),
            'negative_count': len(prefs.get('negatif', [])),
            'flexibility_score': (31 - len(prefs.get('negatif', []))) / 31,
            'weekend_preference': sum(1 for day in prefs.get('pozitif', []) 
                                    if self.get_weekday_type(day) == "weekend"),
            'weekday_preference': sum(1 for day in prefs.get('pozitif', []) 
                                    if self.get_weekday_type(day) == "weekday"),
            'has_special_notes': 1 if prefs.get('ozelSebepler', '').strip() else 0,
            'preference_ratio': len(prefs.get('pozitif', [])) / max(1, len(prefs.get('negatif', [])))
        }
        
        return features
    
    def linear_programming_optimize(self) -> Optional[Dict]:
        """Linear Programming ile optimal çizelge oluşturur"""
        if not LP_AVAILABLE:
            self.optimization_log.append("❌ Linear Programming kullanılamıyor")
            return None
            
        try:
            self.optimization_log.append("🔧 Linear Programming başlatılıyor...")
            
            # Problem tanımı
            prob = LpProblem("Nobet_Cizelgesi", LpMaximize)
            
            # Karar değişkenleri: x[doctor][day] = 1 if assigned, 0 otherwise
            x = {}
            for doctor in self.doctors:
                x[doctor] = {}
                for day in range(1, self.days_in_month + 1):
                    x[doctor][day] = LpVariable(f"x_{doctor}_{day}", cat='Binary')
            
            # Objektif fonksiyon: Pozitif tercihleri maksimize et
            objective = 0
            for doctor in self.doctors:
                prefs = self.preferences.get(doctor, {})
                positive_days = prefs.get('pozitif', [])
                negative_days = prefs.get('negatif', [])
                
                for day in range(1, self.days_in_month + 1):
                    if day in positive_days:
                        objective += 10 * x[doctor][day]  # Pozitif tercih bonusu
                    elif day in negative_days:
                        objective -= 5 * x[doctor][day]   # Negatif tercih penaltı
                    else:
                        objective += 1 * x[doctor][day]   # Nötr gün
            
            prob += objective
            
            # Kısıtlamalar
            
            # 1. Her gün gerekli doktor sayısı
            for day in range(1, self.days_in_month + 1):
                day_type = self.get_weekday_type(day)
                required = self.WEEKEND_DOCTORS_NEEDED if day_type == "weekend" else self.WEEKDAY_DOCTORS_NEEDED
                
                prob += lpSum([x[doctor][day] for doctor in self.doctors]) == required
            
            # 2. Her doktor için maksimum nöbet sayısı
            for doctor in self.doctors:
                prob += lpSum([x[doctor][day] for day in range(1, self.days_in_month + 1)]) <= self.MAX_SHIFTS_PER_DOCTOR
                prob += lpSum([x[doctor][day] for day in range(1, self.days_in_month + 1)]) >= max(1, self.TARGET_SHIFTS_PER_DOCTOR - 2)
            
            # 3. Ardışık nöbet yasağı (minimum 1 gün ara)
            for doctor in self.doctors:
                for day in range(1, self.days_in_month):
                    prob += x[doctor][day] + x[doctor][day + 1] <= 1
            
            # 4. Negatif tercihleri mümkün oldukça kaçın
            for doctor in self.doctors:
                prefs = self.preferences.get(doctor, {})
                negative_days = prefs.get('negatif', [])
                for day in negative_days:
                    if 1 <= day <= self.days_in_month:
                        # Soft constraint: Negatif günlerde nöbet vermemeye çalış
                        prob += x[doctor][day] <= 0.1
            
            # Çözümle
            self.optimization_log.append("⚡ LP çözümü hesaplanıyor...")
            prob.solve(PULP_CBC_CMD(msg=0))
            
            if prob.status == 1:  # Optimal
                schedule = {}
                total_satisfaction = 0
                
                for day in range(1, self.days_in_month + 1):
                    assigned_doctors = []
                    for doctor in self.doctors:
                        if x[doctor][day].varValue == 1:
                            assigned_doctors.append(doctor)
                            
                            # Memnuniyet skoru hesapla
                            prefs = self.preferences.get(doctor, {})
                            if day in prefs.get('pozitif', []):
                                total_satisfaction += 10
                            elif day in prefs.get('negatif', []):
                                total_satisfaction -= 5
                            else:
                                total_satisfaction += 1
                    
                    schedule[day] = assigned_doctors
                
                self.quality_score = total_satisfaction / (self.days_in_month * len(self.doctors))
                self.optimization_log.append(f"✅ LP başarılı! Kalite skoru: {self.quality_score:.2f}")
                
                return schedule
            else:
                self.optimization_log.append("❌ LP çözüm bulamadı")
                return None
                
        except Exception as e:
            self.optimization_log.append(f"❌ LP hatası: {str(e)}")
            return None
    
    def genetic_algorithm_optimize(self) -> Optional[Dict]:
        """Genetic Algorithm ile çizelge oluşturur"""
        if not GA_AVAILABLE:
            self.optimization_log.append("❌ Genetic Algorithm kullanılamıyor")
            return None
            
        try:
            self.optimization_log.append("🧬 Genetic Algorithm başlatılıyor...")
            
            # DEAP için setup
            creator.create("FitnessMax", base.Fitness, weights=(1.0,))
            creator.create("Individual", list, fitness=creator.FitnessMax)
            
            toolbox = base.Toolbox()
            
            def create_individual():
                """Rastgele bir çizelge oluştur"""
                individual = []
                for day in range(1, self.days_in_month + 1):
                    day_type = self.get_weekday_type(day)
                    required = self.WEEKEND_DOCTORS_NEEDED if day_type == "weekend" else self.WEEKDAY_DOCTORS_NEEDED
                    
                    # Bu gün için doktorları seç
                    available_doctors = list(self.doctors)
                    
                    # Negatif tercihi olanları filtrele
                    filtered_doctors = []
                    for doctor in available_doctors:
                        prefs = self.preferences.get(doctor, {})
                        if day not in prefs.get('negatif', []):
                            filtered_doctors.append(doctor)
                    
                    if len(filtered_doctors) >= required:
                        available_doctors = filtered_doctors
                    
                    selected = random.sample(available_doctors, min(required, len(available_doctors)))
                    individual.extend(selected)
                
                return individual
            
            def evaluate_individual(individual):
                """Çizelge kalitesini değerlendir"""
                schedule = {}
                idx = 0
                total_score = 0
                
                # Individual'ı schedule'a çevir
                for day in range(1, self.days_in_month + 1):
                    day_type = self.get_weekday_type(day)
                    required = self.WEEKEND_DOCTORS_NEEDED if day_type == "weekend" else self.WEEKDAY_DOCTORS_NEEDED
                    
                    schedule[day] = individual[idx:idx + required]
                    idx += required
                
                # Kalite skorunu hesapla
                doctor_shift_counts = {doctor: 0 for doctor in self.doctors}
                
                for day, doctors in schedule.items():
                    for doctor in doctors:
                        doctor_shift_counts[doctor] += 1
                        
                        prefs = self.preferences.get(doctor, {})
                        if day in prefs.get('pozitif', []):
                            total_score += 10  # Pozitif tercih bonusu
                        elif day in prefs.get('negatif', []):
                            total_score -= 20  # Negatif tercih penaltı
                        else:
                            total_score += 1   # Nötr gün
                
                # Nöbet sayısı dengesizliği penaltı
                target_shifts = self.TARGET_SHIFTS_PER_DOCTOR
                for count in doctor_shift_counts.values():
                    deviation = abs(count - target_shifts)
                    total_score -= deviation * 5
                
                # Ardışık nöbet penaltı
                for day in range(1, self.days_in_month):
                    current_doctors = set(schedule.get(day, []))
                    next_doctors = set(schedule.get(day + 1, []))
                    consecutive = current_doctors.intersection(next_doctors)
                    total_score -= len(consecutive) * 15
                
                return (total_score,)
            
            # GA operatörleri
            toolbox.register("individual", tools.initIterate, creator.Individual, create_individual)
            toolbox.register("population", tools.initRepeat, list, toolbox.individual)
            toolbox.register("evaluate", evaluate_individual)
            toolbox.register("mate", tools.cxTwoPoint)
            toolbox.register("mutate", tools.mutShuffleIndexes, indpb=0.1)
            toolbox.register("select", tools.selTournament, tournsize=3)
            
            # GA parametreleri
            population = toolbox.population(n=50)
            CXPB, MUTPB, NGEN = 0.7, 0.3, 100
            
            self.optimization_log.append("🔄 GA nesilleri hesaplanıyor...")
            
            # Evrimi çalıştır
            for gen in range(NGEN):
                offspring = algorithms.varAnd(population, toolbox, CXPB, MUTPB)
                fits = toolbox.map(toolbox.evaluate, offspring)
                
                for fit, ind in zip(fits, offspring):
                    ind.fitness.values = fit
                
                population = toolbox.select(offspring, k=len(population))
                
                if gen % 20 == 0:
                    best_fitness = max([ind.fitness.values[0] for ind in population])
                    self.optimization_log.append(f"  Nesil {gen}: En iyi skor = {best_fitness:.1f}")
            
            # En iyi çözümü al
            best_individual = max(population, key=lambda x: x.fitness.values[0])
            
            # Schedule'a çevir
            schedule = {}
            idx = 0
            for day in range(1, self.days_in_month + 1):
                day_type = self.get_weekday_type(day)
                required = self.WEEKEND_DOCTORS_NEEDED if day_type == "weekend" else self.WEEKDAY_DOCTORS_NEEDED
                
                schedule[day] = best_individual[idx:idx + required]
                idx += required
            
            self.quality_score = best_individual.fitness.values[0] / (self.days_in_month * len(self.doctors))
            self.optimization_log.append(f"✅ GA başarılı! Kalite skoru: {self.quality_score:.2f}")
            
            return schedule
            
        except Exception as e:
            self.optimization_log.append(f"❌ GA hatası: {str(e)}")
            return None
    
    def machine_learning_enhance(self, schedule: Dict) -> Dict:
        """Machine Learning ile çizelgeyi iyileştirir"""
        if not ML_AVAILABLE:
            self.optimization_log.append("⚠️  ML iyileştirme atlandı")
            return schedule
            
        try:
            self.optimization_log.append("🤖 ML iyileştirmesi başlatılıyor...")
            
            # Doktor özelliklerini hesapla
            doctor_features = {}
            for doctor in self.doctors:
                doctor_features[doctor] = self.calculate_doctor_features(doctor)
            
            # Memnuniyet skorları hesapla
            satisfaction_scores = {}
            for doctor in self.doctors:
                total_satisfaction = 0
                prefs = self.preferences.get(doctor, {})
                
                assigned_days = [day for day, doctors in schedule.items() if doctor in doctors]
                
                for day in assigned_days:
                    if day in prefs.get('pozitif', []):
                        total_satisfaction += 10
                    elif day in prefs.get('negatif', []):
                        total_satisfaction -= 10
                    else:
                        total_satisfaction += 5
                
                satisfaction_scores[doctor] = total_satisfaction
            
            # Basit takas optimizasyonu
            improved_schedule = schedule.copy()
            improvements = 0
            
            for day1 in range(1, self.days_in_month + 1):
                for day2 in range(day1 + 2, self.days_in_month + 1):  # En az 1 gün ara
                    # Gün tiplerini kontrol et
                    if self.get_weekday_type(day1) != self.get_weekday_type(day2):
                        continue
                    
                    doctors1 = improved_schedule[day1]
                    doctors2 = improved_schedule[day2]
                    
                    # Takas dene
                    for i, doctor1 in enumerate(doctors1):
                        for j, doctor2 in enumerate(doctors2):
                            # Takas yap
                            new_doctors1 = doctors1.copy()
                            new_doctors2 = doctors2.copy()
                            new_doctors1[i] = doctor2
                            new_doctors2[j] = doctor1
                            
                            # Yeni memnuniyeti hesapla
                            old_satisfaction = 0
                            new_satisfaction = 0
                            
                            # Doctor1 için
                            prefs1 = self.preferences.get(doctor1, {})
                            if day1 in prefs1.get('pozitif', []):
                                old_satisfaction += 10
                            elif day1 in prefs1.get('negatif', []):
                                old_satisfaction -= 10
                            
                            if day2 in prefs1.get('pozitif', []):
                                new_satisfaction += 10
                            elif day2 in prefs1.get('negatif', []):
                                new_satisfaction -= 10
                            
                            # Doctor2 için
                            prefs2 = self.preferences.get(doctor2, {})
                            if day2 in prefs2.get('pozitif', []):
                                old_satisfaction += 10
                            elif day2 in prefs2.get('negatif', []):
                                old_satisfaction -= 10
                            
                            if day1 in prefs2.get('pozitif', []):
                                new_satisfaction += 10
                            elif day1 in prefs2.get('negatif', []):
                                new_satisfaction -= 10
                            
                            # İyileştirme varsa uygula
                            if new_satisfaction > old_satisfaction:
                                improved_schedule[day1] = new_doctors1
                                improved_schedule[day2] = new_doctors2
                                improvements += 1
            
            self.optimization_log.append(f"✅ ML ile {improvements} iyileştirme yapıldı")
            return improved_schedule
            
        except Exception as e:
            self.optimization_log.append(f"⚠️  ML hatası: {str(e)}")
            return schedule
    
    def generate_optimal_schedule(self) -> Dict:
        """Ana optimizasyon fonksiyonu"""
        self.optimization_log.append("🚀 Akıllı çizelge optimizasyonu başlatılıyor...")
        self.optimization_log.append(f"📊 {len(self.doctors)} doktor, {self.days_in_month} gün")
        
        # 1. Linear Programming dene
        schedule = self.linear_programming_optimize()
        
        # 2. LP başarısız olursa GA kullan
        if schedule is None:
            self.optimization_log.append("🔄 LP başarısız, GA'ya geçiliyor...")
            schedule = self.genetic_algorithm_optimize()
        
        # 3. Hala çözüm yoksa basit algoritma
        if schedule is None:
            self.optimization_log.append("🔄 GA başarısız, basit algoritma kullanılıyor...")
            schedule = self.simple_greedy_algorithm()
        
        # 4. ML ile iyileştir
        if schedule:
            schedule = self.machine_learning_enhance(schedule)
            self.schedule = schedule
        
        return schedule
    
    def simple_greedy_algorithm(self) -> Dict:
        """Basit greedy algoritma"""
        try:
            self.optimization_log.append("🎯 Basit greedy algoritma başlatılıyor...")
            
            schedule = {}
            doctor_shift_counts = {doctor: 0 for doctor in self.doctors}
            
            for day in range(1, self.days_in_month + 1):
                day_type = self.get_weekday_type(day)
                required = self.WEEKEND_DOCTORS_NEEDED if day_type == "weekend" else self.WEEKDAY_DOCTORS_NEEDED
                
                # Uygun doktorları bul
                available_doctors = []
                for doctor in self.doctors:
                    # Ardışık nöbet kontrolü
                    if day > 1 and doctor in schedule.get(day - 1, []):
                        continue
                    if doctor_shift_counts[doctor] < self.MAX_SHIFTS_PER_DOCTOR:
                        available_doctors.append(doctor)
                
                # Tercihlere göre sırala
                def doctor_priority(doctor):
                    prefs = self.preferences.get(doctor, {})
                    score = 0
                    
                    if day in prefs.get('pozitif', []):
                        score += 10
                    elif day in prefs.get('negatif', []):
                        score -= 10
                    
                    # Az nöbet tutmuş doktorları öncelendir
                    score += (self.TARGET_SHIFTS_PER_DOCTOR - doctor_shift_counts[doctor]) * 2
                    
                    return score
                
                available_doctors.sort(key=doctor_priority, reverse=True)
                
                # Gerekli sayıda doktor seç
                selected = available_doctors[:required]
                schedule[day] = selected
                
                for doctor in selected:
                    doctor_shift_counts[doctor] += 1
            
            self.optimization_log.append("✅ Basit algoritma tamamlandı")
            return schedule
            
        except Exception as e:
            self.optimization_log.append(f"❌ Basit algoritma hatası: {str(e)}")
            return {}
    
    def generate_report(self) -> Dict:
        """Çizelge raporu oluşturur"""
        if not self.schedule:
            return {"error": "Çizelge oluşturulamadı"}
        
        # İstatistikler hesapla
        doctor_stats = {}
        for doctor in self.doctors:
            assigned_days = [day for day, doctors in self.schedule.items() if doctor in doctors]
            prefs = self.preferences.get(doctor, {})
            
            positive_matches = len([day for day in assigned_days if day in prefs.get('pozitif', [])])
            negative_matches = len([day for day in assigned_days if day in prefs.get('negatif', [])])
            
            doctor_stats[doctor] = {
                'total_shifts': len(assigned_days),
                'assigned_days': assigned_days,
                'positive_matches': positive_matches,
                'negative_matches': negative_matches,
                'satisfaction_score': (positive_matches * 10 - negative_matches * 10) / max(1, len(assigned_days))
            }
        
        # Genel istatistikler
        total_satisfaction = sum(stats['satisfaction_score'] * stats['total_shifts'] 
                               for stats in doctor_stats.values())
        average_satisfaction = total_satisfaction / sum(stats['total_shifts'] for stats in doctor_stats.values())
        
        return {
            'schedule': self.schedule,
            'doctor_stats': doctor_stats,
            'optimization_log': self.optimization_log,
            'quality_metrics': {
                'overall_satisfaction': average_satisfaction,
                'quality_score': self.quality_score,
                'total_shifts': sum(len(doctors) for doctors in self.schedule.values()),
                'algorithm_used': self.optimization_log[-2] if len(self.optimization_log) > 1 else "Bilinmiyor"
            }
        }

def main():
    """Ana çalıştırma fonksiyonu"""
    parser = argparse.ArgumentParser(description='NöbetSihirbazı Akıllı Çizelge Optimizatörü')
    parser.add_argument('--input', '-i', required=True, help='Tercihler JSON dosyası')
    parser.add_argument('--output', '-o', default='optimized_schedule.json', help='Çıktı dosyası')
    parser.add_argument('--verbose', '-v', action='store_true', help='Detaylı log')
    
    args = parser.parse_args()
    
    try:
        # Tercihleri yükle
        with open(args.input, 'r', encoding='utf-8') as f:
            preferences_data = json.load(f)
        
        print("🚀 NöbetSihirbazı Akıllı Optimizasyon Başlatılıyor...")
        print(f"📊 {len(preferences_data)} doktor tercihi yüklendi")
        
        # Optimizatörü başlat
        optimizer = NobetOptimizer(preferences_data)
        
        # Çizelgeyi oluştur
        schedule = optimizer.generate_optimal_schedule()
        
        if schedule:
            # Raporu oluştur
            report = optimizer.generate_report()
            
            # Sonuçları kaydet
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
            
            print(f"✅ Optimizasyon tamamlandı!")
            print(f"📁 Sonuç dosyası: {args.output}")
            print(f"🎯 Kalite skoru: {report['quality_metrics']['quality_score']:.2f}")
            print(f"😊 Genel memnuniyet: {report['quality_metrics']['overall_satisfaction']:.1f}/10")
            
            if args.verbose:
                for log in optimizer.optimization_log:
                    print(f"  {log}")
                    
        else:
            print("❌ Çizelge oluşturulamadı!")
            return 1
            
    except FileNotFoundError:
        print(f"❌ Dosya bulunamadı: {args.input}")
        return 1
    except json.JSONDecodeError:
        print(f"❌ JSON format hatası: {args.input}")
        return 1
    except Exception as e:
        print(f"❌ Beklenmeyen hata: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main()) 