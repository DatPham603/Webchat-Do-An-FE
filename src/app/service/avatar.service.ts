// avatar.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AvatarService {
  private baseUrl = 'http://localhost:8989/api/v1/users/avatar/get-avatar/';

  constructor(private http: HttpClient) {}

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  getAvatarImage(filename: string): Observable<Blob> {
    const token = this.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
    });
    // Không thêm dấu '/' thừa ở đây
    return this.http.get(`${this.baseUrl}${filename}`, { headers, responseType: 'blob' });
  }
}